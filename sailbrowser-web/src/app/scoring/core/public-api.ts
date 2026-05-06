import type { PublishedRace } from 'app/published-results/model/published-race';
import type { Race } from 'app/race-calender/model/race';
import type { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import type { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import type { MergeStrategy } from 'app/scoring/services/merge-key';
import { score } from 'app/scoring/services/scorer';
import type { ScoringConfig } from 'app/scoring/services/series-scorer';

export interface SeriesScoringInput {
  raceToScore: Race | null;
  competitorsInRace: RaceCompetitor[];
  existingScoredRaces: PublishedRace[];
  seriesEntries: SeriesEntry[];
  config: ScoringConfig;
  scoringConfiguration: ScoringConfiguration;
  mergeStrategy: MergeStrategy;
}

export type SeriesScoringOutput = ReturnType<typeof score>;

export function scoreSeriesSnapshot(input: SeriesScoringInput): SeriesScoringOutput {
  return score(
    input.raceToScore,
    input.competitorsInRace,
    input.existingScoredRaces,
    input.seriesEntries,
    input.config,
    input.scoringConfiguration,
    input.mergeStrategy,
  );
}
