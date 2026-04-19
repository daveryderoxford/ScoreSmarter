import { PublishedSeriesResult } from '../../published-results';
import { SeriesScoringScheme } from '../model/scoring-algotirhm';
import { PublishedRace, RaceResult } from '../../published-results/model/published-race';
import { getShortAlgorithm, includeInAveragePool, isDiscardable as isResultCodeDiscardable, ResultCodeAlgorithm, isStartAreaComp, isFinishedComp } from '../model/result-code-scoring';
import { SeriesEntry } from '../../results-input';
import { getHandicapValue } from '../model/handicap';
import { HandicapScheme } from '../model/handicap-scheme';
import { mergeKeyFor, type MergeStrategy } from './merge-key';

export interface ScoringConfig {
  seriesType: SeriesScoringScheme;
  discards: number;
  maxOodPerSeries?: number;
  oodAveragePool?: 'finished' | 'started';
}

/**
 * Intermediate data structure for series scoring calculations.
 */
export interface IntermediateSeriesResult extends PublishedSeriesResult {
}

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
  const competitorMap = aggregateCompetitorResults(races, seriesEntries, handicapScheme, mergeStrategy);
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

  const dncPoints = groupMembers.size + 1;

  // Sort races chronologically by calendar index for "first appearance" lookups.
  const orderedRaces = [...races].sort((a, b) => a.index - b.index);

  const competitorMap = new Map<string, IntermediateSeriesResult>();

  // Initialise every known merge group, even if they haven't yet raced.
  for (const [key, members] of groupMembers) {
    // Default seed: lowest-id member. Will be overridden when the group's
    // first actual race contribution is found below.
    const seed = members[0];
    competitorMap.set(key, makeSeriesRow(key, seed, handicapScheme));
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
          points: dncPoints,
          resultCode: 'DNC',
          isDiscard: false,
        });
      }
    }
  }

  return competitorMap;
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
  row.club = entry.club || '';
  row.handicap = getHandicapValue(entry.handicaps, handicapScheme) ?? 0;
  row.personalHandicapBand = entry.personalHandicapBand;
  row.boatClass = entry.boatClass;
}

function calculateTotalsAndDiscards(
  results: IntermediateSeriesResult[], 
  config: ScoringConfig): IntermediateSeriesResult[] {

  const dncPoints = results.length + 1;

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

    result.netPoints = scoresToCount.reduce((acc, r) => acc + r.points, 0);
    result.totalPoints = result.raceScores.reduce((acc, r) => acc + r.points, 0);
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
  
  // OOD Pool: 'finished' (FINISHED_AND_SCORED) or 'started' (isStartAreaComp)
  const oodPool = basePool.filter(s => {
    if (oodPoolType === 'finished') return isFinishedComp(s.resultCode) && s.resultCode !== 'DNC';
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

function rankCompetitors(results: IntermediateSeriesResult[]): IntermediateSeriesResult[] {
  // For tie-breaking (A8.1), create a sorted list of scores for each competitor
  results.forEach(result => {
    result.scoresForTiebreak = result.raceScores.filter(r => !r.isDiscard).map(r => r.points).sort((a, b) => a - b);
  });

  results.sort((a, b) => {
    // Primary sort by net points (ascending)
    if (a.netPoints !== b.netPoints) {
      return a.netPoints - b.netPoints;
    }

    // Tie-break A8.1: most firsts, seconds, etc.
    for (let i = 0; i < Math.min(a.scoresForTiebreak.length, b.scoresForTiebreak.length); i++) {
      if (a.scoresForTiebreak[i] !== b.scoresForTiebreak[i]) {
        return a.scoresForTiebreak[i] - b.scoresForTiebreak[i];
      }
    }

    // Tie-break A8.2: score in the last race
    if (a.raceScores.length > 0 && b.raceScores.length > 0) {
      // Find the score from the most recent race (highest raceIndex)
      const lastRaceA = a.raceScores.reduce((prev, current) => (prev.raceIndex > current.raceIndex) ? prev : current);
      const lastRaceB = b.raceScores.find(s => s.raceIndex === lastRaceA.raceIndex)!;
      return lastRaceA.points - lastRaceB.points;
    }

    return 0;
  });

  // Assign ranks
  let currentRank = 1;
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && isTied(results[i - 1], results[i])) {
      results[i].rank = results[i - 1].rank;
    } else {
      results[i].rank = currentRank;
    }
    currentRank++;
  }

  return results;
}

function isTied(a: IntermediateSeriesResult, b: IntermediateSeriesResult): boolean {
  if (a.netPoints !== b.netPoints) {
    return false;
  }

  if (a.scoresForTiebreak.length !== b.scoresForTiebreak.length) {
    return false;
  }

  for (let i = 0; i < a.scoresForTiebreak.length; i++) {
    if (a.scoresForTiebreak[i] !== b.scoresForTiebreak[i]) {
      return false;
    }
  }

  return true;
}
