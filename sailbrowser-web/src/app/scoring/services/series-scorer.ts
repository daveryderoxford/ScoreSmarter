import { PublishedSeriesResult } from '../../published-results';
import { SeriesScoringScheme } from '../model/scoring-algotirhm';
import { PublishedRace } from '../../published-results/model/published-race';
import { getShortAlgorithm, includeInAveragePool, isDiscardable as isResultCodeDiscardable, ResultCodeAlgorithm, isStartAreaComp, isFinishedComp } from '../model/result-code-scoring';
import { SeriesEntry } from '../../results-input';
import { getHandicapValue } from '../model/handicap';
import { HandicapScheme } from '../model/handicap-scheme';

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
 * @param races - An array of PublishedRace objects for the series.
 * @param seriesEntries - An array of SeriesEntry objects defining the competitors.
 * @param config - The scoring configuration for the series.
 * @returns An array of SeriesCompetitorResult, sorted by rank.
 */
export function scoreSeries(
  races: PublishedRace[],
  seriesEntries: SeriesEntry[],
  config: ScoringConfig,
  handicapScheme: HandicapScheme
): IntermediateSeriesResult[] {
  const competitorMap = aggregateCompetitorResults(races, seriesEntries, handicapScheme);
  const resultsWithTotals = calculateTotalsAndDiscards(Array.from(competitorMap.values()), config);
  const rankedResults = rankCompetitors(resultsWithTotals);

  return rankedResults;
}

function aggregateCompetitorResults(
  races: PublishedRace[],
  seriesEntries: SeriesEntry[],
  handicapScheme: HandicapScheme
): Map<string, IntermediateSeriesResult> {
  const competitorMap = new Map<string, IntermediateSeriesResult>();
  const dncPoints = seriesEntries.length + 1;
  
  seriesEntries.forEach(entry => {
    competitorMap.set(entry.id, {
      seriesEntryId: entry.id,
      helm: entry.helm,
      crew: entry.crew,
      sailNumber: entry.sailNumber,
      club: entry.club || '',
      handicap: getHandicapValue(entry.handicaps, handicapScheme) ?? 0,
      personalHandicapBand: entry.personalHandicapBand,
      handicapScheme,
      boatClass: entry.boatClass,
      raceScores: [],
      totalPoints: 0,
      netPoints: 0,
      rank: 0,
      scoresForTiebreak: [],
    });
  });

  races.forEach((race) => {
    const resultsByKey = new Map(race.results.map(r => [r.seriesEntryId, r]));
    competitorMap.forEach((seriesResult, seriesEntryId) => {
      const raceResult = resultsByKey.get(seriesEntryId);
      
      // If the race result has overrides for boat class, sail number, or handicap, 
      // we could potentially use them here. But for the series result summary, 
      // we typically display the default/primary boat details from the SeriesEntry.
      // We'll stick with the SeriesEntry defaults for the overall series display.

      if (raceResult) {
        seriesResult.raceScores.push({ 
          raceIndex: race.index, 
          points: raceResult.points, 
          resultCode: raceResult.resultCode, 
          isDiscard: false, 
        });
      } else {
        // Competitor did not compete in this race (DNC)
        seriesResult.raceScores.push({
          raceIndex: race.index,
          points: dncPoints,
          resultCode: 'DNC',
          isDiscard: false,
        });
      }
    });
  });

  return competitorMap;
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
