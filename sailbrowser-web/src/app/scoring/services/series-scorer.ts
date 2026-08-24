import { PublishedSeriesResult } from '../../published-results';
import { SeriesScoringScheme } from '../model/scoring-algotirhm';
import { PublishedRace, RaceResult } from '../../published-results/model/published-race';
import { getShortAlgorithm, includeInAveragePool, isDiscardable as isResultCodeDiscardable, ResultCodeAlgorithm, isStartAreaComp, isFinishedComp } from '../model/result-code-scoring';
import { SeriesEntry } from '../../results-input';
import { getHandicapValue } from '../model/handicap';
import { HandicapScheme } from '../model/handicap-scheme';
import { mergeKeyFor, type MergeStrategy } from './merge-key';

export const MERGED_BOAT_CLASS_SEPARATOR = '&';

/** One decimal — matches ISAF/OOD pool averages and avoids IEEE-754 sum noise in totals. */
function roundSeriesPointValue(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface ScoringConfig {
  seriesType: SeriesScoringScheme;
  discards: number;
  dncPoints: number;
  excludeNeverRaced?: boolean;
  maxOodPerSeries?: number;
  oodAveragePool?: 'finished' | 'started';
}

/**
 * Intermediate data structure for series scoring calculations.
 */
export type IntermediateSeriesResult = PublishedSeriesResult

/**
 * Aggregates pre-scored race results into a final, ranked series result.
 *
 * Per-hull RaceResults are grouped by `competitorKey` so that merging
 * strategies (e.g. "score by helm") collapse multiple hulls into a single
 * series row. Display fields (helm, boatClass, sailNumber, handicap, PHB,
 * club, crew) are seeded from the per-hull SeriesEntry corresponding to the
 * *first chronological* race contribution for each merge group; race-level
 * tables continue to show the actual per-race details.
 */
export function scoreSeries(
  races: PublishedRace[],
  seriesEntries: SeriesEntry[],
  config: ScoringConfig,
  handicapScheme: HandicapScheme,
  mergeStrategy: MergeStrategy,
): IntermediateSeriesResult[] {
  const competitorMap = aggregateCompetitorResults(races, seriesEntries, handicapScheme, mergeStrategy, config);
  const resultsWithTotals = calculateTotalsAndDiscards(Array.from(competitorMap.values()), config);
  const rankedResults = rankCompetitors(resultsWithTotals);

  return rankedResults;
}

/**
 * Builds one IntermediateSeriesResult per distinct merge group. For each
 * group we:
 *
 *   - Iterate races in calendar (`index`) order.
 *   - Pick the first race in which any hull belonging to the group has a
 *     RaceResult; seed display fields from that hull's SeriesEntry.
 *   - For every race after the first appearance: append the group's points
 *     for that race, or a DNC where no hull in the group raced.
 *
 * `dncPoints` for each group is `mergeGroupCount + 1` where mergeGroupCount
 * is the total number of distinct merge groups across the series.
 */
function aggregateCompetitorResults(
  races: PublishedRace[],
  seriesEntries: SeriesEntry[],
  handicapScheme: HandicapScheme,
  mergeStrategy: MergeStrategy,
  config: ScoringConfig,
): Map<string, IntermediateSeriesResult> {
  const entryById = new Map(seriesEntries.map(e => [e.id, e]));

  // Pre-compute merge groups across all known SeriesEntries so DNC counts and
  // ranking domain are consistent even for hulls that haven't raced yet.
  const groupMembers = new Map<string, SeriesEntry[]>();
  for (const entry of seriesEntries) {
    const key = mergeKeyFor(entry, mergeStrategy);
    const list = groupMembers.get(key);
    if (list) {
      list.push(entry);
    } else {
      groupMembers.set(key, [entry]);
    }
  }

  // Sort races chronologically by calendar index for "first appearance" lookups.
  const orderedRaces = [...races].sort((a, b) => a.index - b.index);
  const racedKeys = new Set<string>();
  for (const race of orderedRaces) {
    for (const result of race.results) {
      racedKeys.add(result.competitorKey);
    }
  }

  const competitorMap = new Map<string, IntermediateSeriesResult>();

  // Initialise every known merge group, even if they haven't yet raced.
  for (const [key, members] of groupMembers) {
    if (config.excludeNeverRaced && !racedKeys.has(key)) {
      continue;
    }
    // Default seed: lowest-id member. Will be overridden when the group's
    // first actual race contribution is found below.
    const seed = members[0];
    const row = makeSeriesRow(key, seed, handicapScheme);
    row.boatClass = mergedBoatClassForGroup(members);
    competitorMap.set(key, row);
  }

  // Walk races in chronological order to seed display from first appearance
  // and to append per-race scores.
  const seededKeys = new Set<string>();

  for (const race of orderedRaces) {
    // Group the per-hull race results by competitorKey for this race. If two
    // hulls in the same merge group somehow appear in the same race we keep
    // the best (lowest) score and remember the first contribution for display.
    const racePointsByKey = new Map<string, { points: number; resultCode: RaceResult['resultCode']; firstResult: RaceResult }>();
    for (const r of race.results) {
      const existing = racePointsByKey.get(r.competitorKey);
      if (!existing) {
        racePointsByKey.set(r.competitorKey, { points: r.points, resultCode: r.resultCode, firstResult: r });
      } else if (r.points < existing.points) {
        racePointsByKey.set(r.competitorKey, { points: r.points, resultCode: r.resultCode, firstResult: existing.firstResult });
      }
    }

    for (const [key, row] of competitorMap) {
      const contribution = racePointsByKey.get(key);

      if (contribution && !seededKeys.has(key)) {
        // First time this merge group races: seed display fields from the
        // SeriesEntry of this race's contribution.
        const entry = entryById.get(contribution.firstResult.seriesEntryId);
        if (entry) {
          seedDisplayFromEntry(row, entry, handicapScheme);
          // Persist all classes sailed by this merged competitor in a single
          // field so published-series docs carry full class context.
          row.boatClass = mergedBoatClassForGroup(groupMembers.get(key) ?? [entry]);
        }
        seededKeys.add(key);
      }

      if (contribution) {
        row.raceScores.push({
          raceIndex: race.index,
          points: contribution.points,
          resultCode: contribution.resultCode,
          isDiscard: false,
        });
      } else {
        row.raceScores.push({
          raceIndex: race.index,
          points: config.dncPoints,
          resultCode: 'DNC',
          isDiscard: false,
        });
      }
    }
  }

  return competitorMap;
}

function mergedBoatClassForGroup(entries: SeriesEntry[]): string {
  const classes = Array.from(
    new Set(entries.map(e => e.boatClass.trim()).filter(Boolean)),
  );
  return classes.join(MERGED_BOAT_CLASS_SEPARATOR);
}

function makeSeriesRow(
  competitorKey: string,
  seed: SeriesEntry,
  handicapScheme: HandicapScheme,
): IntermediateSeriesResult {
  return {
    competitorKey,
    seriesEntryId: seed.id,
    helm: seed.helm,
    crew: seed.crew,
    sailNumber: seed.sailNumber,
    boatName: seed.boatName,
    club: seed.club || '',
    handicap: getHandicapValue(seed.handicaps, handicapScheme) ?? 0,
    personalHandicapBand: seed.personalHandicapBand,
    handicapScheme,
    boatClass: seed.boatClass,
    raceScores: [],
    totalPoints: 0,
    netPoints: 0,
    rank: 0,
    scoresForTiebreak: [],
    // Tags come from the first chronologically contributing entry; see
    // `seedDisplayFromEntry` for the override path.
    tags: [...(seed.tags ?? [])],
  };
}

function seedDisplayFromEntry(
  row: IntermediateSeriesResult,
  entry: SeriesEntry,
  handicapScheme: HandicapScheme,
): void {
  row.seriesEntryId = entry.id;
  row.helm = entry.helm;
  row.crew = entry.crew;
  row.sailNumber = entry.sailNumber;
  row.boatName = entry.boatName;
  row.club = entry.club || '';
  row.handicap = getHandicapValue(entry.handicaps, handicapScheme) ?? 0;
  row.personalHandicapBand = entry.personalHandicapBand;
  row.boatClass = entry.boatClass;
  // Tags follow the same first-chronological rule as the display fields:
  // the seeded value is overwritten on first actual race contribution.
  row.tags = [...(entry.tags ?? [])];
}

function calculateTotalsAndDiscards(
  results: IntermediateSeriesResult[], 
  config: ScoringConfig): IntermediateSeriesResult[] {

  const dncPoints = config.dncPoints;

  // Calculate total and net points after all races are processed
  for (const result of results) {

    // Apply average scores directly. This must be done before discards are calculated.
    applyIsafRedress(result, dncPoints);
    applyClubOod(result, dncPoints, config);
    
    // Identify discardable scores and sort them descending to find the worst ones.
    const scoresToDiscard = result.raceScores
      .filter(s => isResultCodeDiscardable(s.resultCode)) // Creates copy so original raceScore is not mutated
      .sort((a, b) => b.points - a.points)
      .slice(0, config.discards);

    // Set the isDiscard flag on the original raceScore objects
    scoresToDiscard.forEach(s => s.isDiscard = true);

    const scoresToCount = result.raceScores.filter(s => !s.isDiscard);

    result.netPoints = roundSeriesPointValue(scoresToCount.reduce((acc, r) => acc + r.points, 0));
    result.totalPoints = roundSeriesPointValue(result.raceScores.reduce((acc, r) => acc + r.points, 0));
  }
  return results;
}

/** Sets the points for ISAF Redress codes (RDGA, RDGB) */
function applyIsafRedress(result: IntermediateSeriesResult, dncPoints: number) {
  // ISAF Pool: All races except average codes (RDGA, RDGB, OOD)
  const isafPool = result.raceScores.filter(s => includeInAveragePool(s.resultCode));
  
  const isafAvgTotal = isafPool.reduce((acc, s) => acc + s.points, 0);
  const isafAvgAll = isafPool.length > 0 ? Math.round((isafAvgTotal / isafPool.length) * 10) / 10 : dncPoints;

  for (const score of result.raceScores) {
    const algorithm = getShortAlgorithm(score.resultCode);
    
    if (algorithm === ResultCodeAlgorithm.isafAvgAll) {
      score.points = isafAvgAll;
    } else if (algorithm === ResultCodeAlgorithm.isafAvgBefore) {
      const scoresBefore = isafPool.filter(s => s.raceIndex < score.raceIndex);
      if (scoresBefore.length > 0) {
        const totalBefore = scoresBefore.reduce((acc, s) => acc + s.points, 0);
        score.points = Math.round((totalBefore / scoresBefore.length) * 10) / 10;
      } else {
        score.points = dncPoints;
      }
    }
  }
}

/** Sets the points for Club OOD duties */
function applyClubOod(result: IntermediateSeriesResult, dncPoints: number, config: ScoringConfig) {
  const maxOod = config.maxOodPerSeries ?? 999;
  const oodPoolType = config.oodAveragePool ?? 'finished';

  // Base pool: All races except average codes
  const basePool = result.raceScores.filter(s => includeInAveragePool(s.resultCode));
  
  // OOD Pool: 'finished' (legal finishers) or 'started' (boats in start area).
  // DNC and OOD are already excluded by isFinishedComp (both in NO_LEGAL_FINISH).
  const oodPool = basePool.filter(s => {
    if (oodPoolType === 'finished') return isFinishedComp(s.resultCode);
    if (oodPoolType === 'started') return isStartAreaComp(s.resultCode);
    return false;
  });

  const oodAvgTotal = oodPool.reduce((acc, s) => acc + s.points, 0);
  const oodAvg = oodPool.length > 0 ? Math.round((oodAvgTotal / oodPool.length) * 10) / 10 : dncPoints;

  let oodCount = 0;

  // Process chronologically to correctly apply maxOodPerSeries cap
  const chronologicalScores = [...result.raceScores].sort((a, b) => a.raceIndex - b.raceIndex);

  for (const score of chronologicalScores) {
    const algorithm = getShortAlgorithm(score.resultCode);
    
    if (algorithm === ResultCodeAlgorithm.clubOodAverage) {
      if (oodCount < maxOod) {
        score.points = oodAvg;
        oodCount++;
      } else {
        score.points = dncPoints; // Cap reached
      }
    }
  }
}

/**
 * RRS A8.2: last race, then next-to-last, etc., until the tie breaks.
 * Points are as recorded for that race (including scores that are later excluded from the net).
 */
function compareA8RacesLastToFirst(a: IntermediateSeriesResult, b: IntermediateSeriesResult): number {
  const indices = new Set<number>();
  for (const s of a.raceScores) {
    indices.add(s.raceIndex);
  }
  for (const s of b.raceScores) {
    indices.add(s.raceIndex);
  }
  const descending = [...indices].sort((x, y) => y - x);
  for (const raceIndex of descending) {
    const pa = a.raceScores.find(s => s.raceIndex === raceIndex)?.points;
    const pb = b.raceScores.find(s => s.raceIndex === raceIndex)?.points;
    const na = Number(pa);
    const nb = Number(pb);
    if (!Number.isFinite(na) && !Number.isFinite(nb)) {
      continue;
    }
    if (!Number.isFinite(na)) {
      return 1;
    }
    if (!Number.isFinite(nb)) {
      return -1;
    }
    if (na !== nb) {
      return na - nb;
    }
  }
  return 0;
}

/** Full series ordering: net points, then RRS A8.1, then A8.2. Negative ⇒ `a` ranks ahead of `b`. */
function compareSeriesStandings(a: IntermediateSeriesResult, b: IntermediateSeriesResult): number {
  if (a.netPoints !== b.netPoints) {
    return a.netPoints - b.netPoints;
  }

  // A8.1: best-to-worst lists of counting (non-excluded) scores; first difference wins.
  const maxLen = Math.max(a.scoresForTiebreak.length, b.scoresForTiebreak.length);
  for (let i = 0; i < maxLen; i++) {
    const av = a.scoresForTiebreak[i] ?? Number.POSITIVE_INFINITY;
    const bv = b.scoresForTiebreak[i] ?? Number.POSITIVE_INFINITY;
    if (av !== bv) {
      return av - bv;
    }
  }

  return compareA8RacesLastToFirst(a, b);
}

function rankCompetitors(results: IntermediateSeriesResult[]): IntermediateSeriesResult[] {
  // A8.1: sorted counting scores (no excluded / discarded races), best → worst.
  results.forEach(result => {
    result.scoresForTiebreak = result.raceScores
      .filter(r => !r.isDiscard)
      .map(r => roundSeriesPointValue(r.points))
      .sort((a, b) => a - b);
  });

  results.sort(compareSeriesStandings);

  // Assign ranks
  let currentRank = 1;
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && isSeriesStandingsTied(results[i - 1]!, results[i]!)) {
      results[i]!.rank = results[i - 1]!.rank;
    } else {
      results[i]!.rank = currentRank;
    }
    currentRank++;
  }

  return results;
}

function isSeriesStandingsTied(a: IntermediateSeriesResult, b: IntermediateSeriesResult): boolean {
  return compareSeriesStandings(a, b) === 0;
}
