import { PublishedRace, RaceResult } from '../../published-results/model/published-race';
import { Race } from '../../race-calender/model/race';
import { Series } from '../../race-calender/model/series';
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { SeriesEntry } from '../../results-input/model/series-entry';
import { ScoringConfiguration } from '../model/scoring-configuration';
import { buildRaceResults, calculateRacePoints, scoreRace } from './race-scorer';
import { IntermediateSeriesResult, scoreSeries, ScoringConfig } from './series-scorer';

/**
 * Orchestrates the entire scoring process for a series as a pure function.
 * It implements the "Scoring Grid" pattern for multi-pass calculations.
 * 1. Initializes a mutable "scoring grid".
 * 2. Scores the current race (if provided) and updates the grid.
 * 3. Performs series scoring (handles discards and RDG).
 * 4. Applies series-dependent scores (like averages) back to the grid.
 * @returns An object containing the final scored races and series results.
 */
export function score(
  raceToScore: Race | null,
  competitorsInRace: RaceCompetitor[],
  existingScoredRaces: PublishedRace[],
  seriesEntries: SeriesEntry[],
  config: ScoringConfig,
  scoringConfiguration: ScoringConfiguration
): { scoredRaces: PublishedRace[], seriesResults: IntermediateSeriesResult[]; } {

  const seriesCompetitorCount = seriesEntries.length;
  const handicapScheme = scoringConfiguration.handicapScheme || 'PY';

  // 1. Initialize the "Scoring Grid" by creating a mutable copy of the races.
  const scoringGrid: PublishedRace[] = structuredClone(existingScoredRaces);

  // 2. Score the current race and update it in the grid.
  if (raceToScore) {
    const initialResults = buildRaceResults(competitorsInRace, seriesEntries);
    const scoredResults = scoreRace(raceToScore, initialResults, handicapScheme, config.seriesType, seriesCompetitorCount);
    updateGridWithRace(scoringGrid, raceToScore, scoredResults);
  }

  // 2.5 Re-score all races in the grid to ensure series-size dependent penalties (SCP, ZFP, etc.) are correct.
  // This is necessary because as new competitors join the series, the penalty points (which are often % of fleet) change.
  for (const race of scoringGrid) {
    calculateRacePoints(race.results, race.type, handicapScheme, config.seriesType, seriesCompetitorCount);
  }

  // 3. Final series scoring with the fully updated grid.
  const finalSeriesResults = scoreSeries(scoringGrid, seriesEntries, config);

  // 4. Update the scoring grid with points calculated during series scoring (e.g., RDG).
  finalSeriesResults.forEach(seriesResult => {
    seriesResult.raceScores.forEach(raceScore => {
      const race = scoringGrid.find(r => r.index === raceScore.raceIndex);
      if (race) {
        const raceResult = race.results.find(res => res.seriesEntryId === seriesResult.seriesEntryId);
        if (raceResult) raceResult.points = raceScore.points;
      }
    });
  });

  scoringGrid.sort((a, b) => a.index - b.index);

  return { scoredRaces: scoringGrid, seriesResults: finalSeriesResults };
}

/** Updates the race grid with  */
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

