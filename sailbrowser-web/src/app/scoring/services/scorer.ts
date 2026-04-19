import { PublishedRace, RaceResult } from '../../published-results/model/published-race';
import { Race } from '../../race-calender/model/race';
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { SeriesEntry } from '../../results-input/model/series-entry';
import { ScoringConfiguration } from '../model/scoring-configuration';
import { buildRaceResults, calculateRacePoints, scoreRace } from './race-scorer';
import { type MergeStrategy } from './merge-key';
import { IntermediateSeriesResult, scoreSeries, ScoringConfig } from './series-scorer';

/**
 * Orchestrates the entire scoring process for a series as a pure function.
 * It implements the "Scoring Grid" pattern for multi-pass calculations.
 * 1. Initializes a mutable "scoring grid".
 * 2. Scores the current race (if provided) and updates the grid.
 * 3. Performs series scoring (handles discards and RDG).
 * 4. Applies series-dependent scores (like averages) back to the grid.
 *
 * `seriesCompetitorCount` is the count of *distinct merge groups* in the
 * series (NOT the count of per-hull entries) and must be supplied by the
 * caller. `mergeStrategy` controls how per-hull entries are collapsed into
 * competitors at series-aggregation time (see `mergeKeyFor`).
 *
 * @returns An object containing the final scored races and series results.
 */
export function score(
  raceToScore: Race | null,
  competitorsInRace: RaceCompetitor[],
  existingScoredRaces: PublishedRace[],
  seriesEntries: SeriesEntry[],
  config: ScoringConfig,
  scoringConfiguration: ScoringConfiguration,
  mergeStrategy: MergeStrategy,
  seriesCompetitorCount: number,
): { scoredRaces: PublishedRace[], seriesResults: IntermediateSeriesResult[]; } {

  const handicapScheme = scoringConfiguration.handicapScheme || 'PY';

  // 1. Initialize the "Scoring Grid" by creating a mutable copy of the races.
  const scoringGrid: PublishedRace[] = structuredClone(existingScoredRaces);

  // 2. Score the current race and update it in the grid.
  if (raceToScore) {
    const initialResults = buildRaceResults(competitorsInRace, seriesEntries, handicapScheme, mergeStrategy);
    const scoredResults = scoreRace(raceToScore, initialResults, handicapScheme, config.seriesType, seriesCompetitorCount);
    updateGridWithRace(scoringGrid, raceToScore, scoredResults);
  }

  // 2.5 Re-score all races in the grid to ensure series-size
  // dependent penalties (SCP, ZFP, etc.) are correct in the othe races.
  for (const race of scoringGrid) {
    calculateRacePoints(race.results, race.type, handicapScheme, config.seriesType, seriesCompetitorCount);
  }

  // 2.6 Sort by calendar race index before series scoring. Publish/score order may follow
  // actualStart/scheduledStart, so the grid can be [race index 3, race index 2] until here.
  // scoreSeries() builds raceScores in forEach order; series table columns align with raceTitles
  // (orderBy index). Without this sort, column headers and points columns disagree.
  scoringGrid.sort((a, b) => a.index - b.index);

  // 3. Final series scoring with the fully updated grid.
  const finalSeriesResults = scoreSeries(scoringGrid, seriesEntries, config, handicapScheme, mergeStrategy);

  // 4. Update the scoring grid with points calculated during series scoring (e.g., RDG, OOD).
  // Series rows are keyed by `competitorKey` (which can collapse hulls), so we
  // must propagate by `competitorKey` rather than `seriesEntryId`.
  for (const seriesResult of finalSeriesResults) {
    for (const raceScore of seriesResult.raceScores) {
      const race = scoringGrid.find(r => r.index === raceScore.raceIndex);
      if (race) {
        for (const raceResult of race.results) {
          if (raceResult.competitorKey === seriesResult.competitorKey) {
            raceResult.points = raceScore.points;
          }
        }
      }
    }
  }

  return { scoredRaces: scoringGrid, seriesResults: finalSeriesResults };
}

/** Updates the race grid with results from a scored race
 * either add a new race or replacing an exisit on with updated scores
*/
function updateGridWithRace(scoringGrid: PublishedRace[], race: Race, updatedResults: RaceResult[]) {
  const index = scoringGrid.findIndex(r => r.id === race.id);
  if (index > -1) {
    scoringGrid[index].results = updatedResults;
    scoringGrid[index].isAverageLap = race.isAverageLap;
  } else {
    scoringGrid.push({
      ...race,
      isAverageLap: race.isAverageLap,
      results: updatedResults
    });
  }
}
