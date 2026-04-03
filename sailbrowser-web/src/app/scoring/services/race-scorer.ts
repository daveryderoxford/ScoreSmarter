import { PublishedRace, RaceResult } from '../../published-results/model/published-race';
import { Race, RaceType } from '../../race-calender';
import { RaceCompetitor, SeriesEntry } from '../../results-input';
import { HandicapScheme } from '../model/handicap-scheme';
import { getLongAlgorithm, getShortAlgorithm, isFinishedComp, isRedress, isStartAreaComp, ResultCodeAlgorithm } from '../model/result-code-scoring';
import { ScoreSmarterError } from '../../shared/utils/scoresmarter-error';
import { SeriesScoringScheme } from '../model/scoring-algotirhm';
import { getHandicapValue } from '../model/handicap';
import { getCorrectedTime, getElapsedSeconds } from './scorer-times';

/**
 * Uses competitor start, finish. lap and status to calculate results for a single race. 
 * All data in the ResultsData object is populated (elapsed/corrected times points and positions).
 * 
 * Assumes all results for the race are supplied.  
 * The maximum number of laps and number of starters is calculated based on all results. 
 */
export function scoreRace(
  race: Race,
  results: RaceResult[],
  scheme: HandicapScheme,
  seriesType: SeriesScoringScheme,
  seriesCompetitorCount: number,
): RaceResult[] {

  // Calculate elapsed and corrected times for all results.
  calculateTimes(results, race.isAverageLap, scheme);

  // Calculate points and ranks.
  calculateRacePoints(results, race.type, scheme, seriesType, seriesCompetitorCount);

  return results;
}

/**
 * Recalculates points and ranks for a race that already has times calculated.
 * This is useful when the number of competitors in the series changes, 
 * affecting penalty points (SCP, ZFP, etc.).
 */
export function calculateRacePoints(
  results: RaceResult[],
  raceType: RaceType,
  scheme: HandicapScheme,
  seriesType: SeriesScoringScheme,
  seriesCompetitorCount: number,
) {
  // Determine the ordering property for finishers and sort them
  const orderingProperty = determineOrdering(raceType, scheme, results);
  // Sort all results to establish finishing order (finishers first, then by ordering property).
  results.sort((a, b) => sortByFinishingOrder(a, b, orderingProperty));

  // Assign points to finishers based on their sorted order.
  assignPointsForFinishers(results, orderingProperty, seriesType, seriesCompetitorCount);

  // Assign points for non-finishers 
  // Handless codes NOT based on series results (DNF, OCS, etc.).
  applyStaticRacePenalties(results, seriesCompetitorCount, seriesType);

  // Sort all competitors by points to determine final race ranks.
  results.sort((a, b) => sortByPoints(a, b));

  // Calcualte final ranks within race
  calculateRanks(results);
}

/** 
 * Calculates competitor ranks within the race. 
 * Competitors tied on points will recieve the same rank.
 */
export function calculateRanks(results: RaceResult[]) {
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].points === results[i - 1].points) {
      // Tied points, so assign the same rank
      results[i].rank = results[i - 1].rank;
    } else {
      // Not tied, or first competitor, so rank is position in the sorted list
      results[i].rank = i + 1;
    }
  }
}

/**
 * Determines the property to sort finishers 
 * and validates that all finishers have the required data.
 * Throws ScoreSmarterError if complet data to rank all competitors is not avaliable
 * Algorithm is: 
 * 1. If Pursuit -> position.
 * 2. If Level Rating -> if manualPositions -> position, else elapsedTime.
 * 3. Handicap -> correctedTime.
 */
function determineOrdering(raceType: RaceType, scheme: HandicapScheme, results: RaceResult[]): keyof RaceResult {
  let orderingProperty: keyof RaceResult;
  const finishers = results.filter(res => isFinishedComp(res.resultCode));

  if (raceType === 'Pursuit') {
    orderingProperty = 'rank';
    validateFinishersHaveData(finishers, 'rank', 'Pursuit races require a manual position');
  } else if (scheme === 'Level Rating') {
    const useManualPositions = finishers.some(f => f.rank > 0);
    if (useManualPositions) {
      orderingProperty = 'rank';
      validateFinishersHaveData(finishers, 'rank', 'Manual positions are used');
    } else {
      orderingProperty = 'elapsedTime';
      validateFinishersHaveData(finishers, 'elapsedTime', 'Finish times are used');
    }
  } else { // Handicap race
    orderingProperty = 'correctedTime';
    // For handicap races, a corrected time of 0 implies missing finish time, which is an error for a finisher.
    validateFinishersHaveData(finishers, 'correctedTime', 'Handicap races require a finish time');
  }
  return orderingProperty;
}

/**
 * Checks that all finishers have a valid (non-zero) value for the specified ordering property.
 * Throws a SailbrowserError if any finisher is missing data.
 */
function validateFinishersHaveData(finishers: RaceResult[], property: keyof RaceResult, context: string) {
  const missingData = finishers
    // Exclude competitors with redress from finish time validation, as they may not have one.
    .filter(f => !isRedress(f.resultCode))
    .find(f => !((f[property] as number) > 0));
  if (missingData) {
    const propertyName = property === 'rank' ? 'position' : 'finish time';
    throw new ScoreSmarterError(`Inconsistent ordering data: ${context}, but finisher with sail number ${missingData.sailNumber} is missing a ${propertyName}.`);
  }
}

/**
 * Maps RaceCompetitor data to initial RaceResult objects.
 */
export function buildRaceResults(
  competitors: RaceCompetitor[],
  seriesEntries: SeriesEntry[],
  scheme: HandicapScheme
): RaceResult[] {
  const entryMap = new Map(seriesEntries.map(e => [e.id, e]));

  return competitors.map((comp) => {
    const entry = entryMap.get(comp.seriesEntryId);
    if (!entry) {
      throw new ScoreSmarterError(`Series entry not found for competitor ${comp.id}`);
    }

    return {
      seriesEntryId: comp.seriesEntryId,
      rank: comp.manualPosition || 0,
      boatClass: comp.boatClass || entry.boatClass,
      sailNumber: comp.sailNumber || 0,
      helm: comp.helm || entry.helm,
      crew: comp.crew || entry.crew,
      club: entry.club,
      laps: comp.numLaps,
      handicap: getHandicapValue(comp.handicaps, scheme) ?? getHandicapValue(entry.handicaps, scheme) ?? 0,
      startTime: comp.startTime!,
      finishTime: comp.finishTime!,
      elapsedTime: 0,
      correctedTime: 0,
      points: 0,
      resultCode: comp.resultCode,
    };
  });
}

/**
 * Calculates elapsed and corrected times for each result.
 */
function calculateTimes(results: RaceResult[], isAverageLap: boolean, scheme: HandicapScheme) {
  const maxLaps = results.reduce((max, res) => (res.laps > max) ? res.laps : max, 0);

  for (const result of results) {
    result.elapsedTime = getElapsedSeconds({
      startTime: result.startTime,
      finishTime: result.finishTime,
      resultCode: result.resultCode,
      isAverageLap,
      laps: result.laps,
      maxLaps,
    });
    result.correctedTime = getCorrectedTime(result.elapsedTime, result.handicap, scheme);
  }
}

/** Assigns points based on the competitor's ellapsed/corrected time.
 * Competitors with the same value for the given key (e.g., correctedTime or rank)
 * are awarded tied points.  
 * When multiple competitors are tied, the score is rounded to 1 decimal place. 
 * Scoring penalty codes are included and the scoting penatly applied 
 */
function assignPointsForFinishers(
  results: RaceResult[],
  key: keyof RaceResult,
  seriesType: SeriesScoringScheme,
  seriesCompetitorCount: number,
) {
  const finishers = results.filter((res) => isFinishedComp(res.resultCode));
  const resultsByValue = new Map<number, RaceResult[]>();

  // Group competitors by the value of the specified key
  for (const res of finishers) {
    const value = (res[key] as number) || 0;
    // A value of 0 is used for null for time/position, so we don't want to treat it as falsey.
    if (value === 0 && res.resultCode !== 'OK') continue;
    if (!resultsByValue.has(value)) resultsByValue.set(value, []);
    resultsByValue.get(value)!.push(res);
  }

  // Iterate over ordered list of values, calculating points for ties
  const sortedValues = Array.from(resultsByValue.keys()).sort((a, b) => a - b);
  let pos = 1.0;

  const startAreaCount = results.filter(r => isStartAreaComp(r.resultCode)).length;
  const dnfPoints = (seriesType === 'long' ? startAreaCount : seriesCompetitorCount) + 1;

  for (const value of sortedValues) {
    const resultsAtValue = resultsByValue.get(value)!;
    // The average points for a group of tied competitors is the average of the positions they would have taken.
    // For example, if 2 boats tie for 2nd, they take up positions 2 and 3, so they both get (2+3)/2 = 2.5 points.
    const avgPoints = pos - 1 + (resultsAtValue.length + 1) / 2.0;

    for (const res of resultsAtValue) {
      // Round ties to one decimal place 
      res.points = Math.round(avgPoints * 10) / 10;
      res.rank = pos;

      // If the competitor has a scoring penalty, apply it now.
      const algorithm = getShortAlgorithm(res.resultCode);
      if (algorithm === ResultCodeAlgorithm.scoringPenalty) {
        // RRS 44.3(c): Finish position + (20% * Boats Entered)
        // The minimum penalty is two places.
        // Rounding to 1/10 of a point as per user requirement.
        const penalty = Math.max(2, Math.round(seriesCompetitorCount * 0.2 * 10) / 10);
        // The penalty is capped at the DNF score.
        res.points = Math.min(res.points + penalty, dnfPoints);
      }
    }
    pos += resultsAtValue.length;
  }
}

/** Applies panalties that are not dependent on other 
 * results in the series. 
 */
function applyStaticRacePenalties(results: RaceResult[],
  seriesCompetitorCount: number,
  scheme: SeriesScoringScheme) {

  // 1. Calculate the number of boats that came to the start area for this specific race
  const startAreaCount = results.filter(r => isStartAreaComp(r.resultCode)).length;

  // This function should only apply penalties to non-finishers.
  // Finishers with penalties (like SCP) are handled in `assignPointsForFinishers`.
  const nonFinishers = results.filter(r => !isFinishedComp(r.resultCode));

  for (const result of nonFinishers) {
    // Determine which algorithm to use based on the scheme
    const algorithm = (scheme === 'long')
      ? getLongAlgorithm(result.resultCode)
      : getShortAlgorithm(result.resultCode);

    switch (algorithm) {
      case ResultCodeAlgorithm.compInSeries:
        result.points = seriesCompetitorCount + 1;
        break;
      case ResultCodeAlgorithm.compInStartArea:
        result.points = startAreaCount + 1;
        break;
      default:
        break;
    }
  }
}

/** 
 * Sorts by points.  Any boat that does not have any points yet 
 * assigned is sorted to the bottom.
 */
export function sortByPoints(a: RaceResult, b: RaceResult): number {
  return (a.points || 9999) - (b.points || 9999);
}

/**
 * Sorts results by a specified ordering property, ensuring that finishers always
 * appear before non-finishers.
 */
function sortByFinishingOrder(a: RaceResult, b: RaceResult, orderingProperty: keyof RaceResult): number {
  const aIsFinisher = isFinishedComp(a.resultCode);
  const bIsFinisher = isFinishedComp(b.resultCode);

  if (aIsFinisher && bIsFinisher) {
    return (a[orderingProperty] as number || 0) - (b[orderingProperty] as number || 0);
  } else if (aIsFinisher && !bIsFinisher) {
    return -1;
  } else if (!aIsFinisher && bIsFinisher) {
    return 1;
  } else {
    return 0; // Keep original order for non-finishers relative to each other
  }
}