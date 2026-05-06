import type { DncCalculation } from 'app/club-tenant/model/club';
import type { PublishedRace } from 'app/published-results/model/published-race';
import type { Race } from 'app/race-calender/model/race';
import type { SeriesEntry } from 'app/results-input';
import type { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import { computeDncPoints } from 'app/scoring/services/dnc-policy';
import { mergeKeyFor, type MergeStrategy } from 'app/scoring/services/merge-key';
import { competitorsForConfigRace } from './eligibility';
import { countableSeriesEntryIds, isCountingCompetitorResultCode } from './counting-policy';

export interface DncContext {
  dncPoints: number;
  countableEntryIds: Set<string>;
}

export const DEFAULT_DNC_POLICY: DncCalculation = {
  basis: 'SeriesEntries',
  offset: 1,
  excludeNeverRaced: false,
};

export function buildDncContext(args: {
  racesToScore: Race[];
  config: ScoringConfiguration;
  seriesEntries: SeriesEntry[];
  allSeriesCompetitors: RaceCompetitor[];
  mergeStrategy: MergeStrategy;
  dncPolicy: DncCalculation;
}): DncContext {
  const { racesToScore, config, seriesEntries, allSeriesCompetitors, mergeStrategy, dncPolicy } = args;

  const competitorsForScoredRaces = racesToScore.flatMap(race =>
    competitorsForConfigRace(race, config, allSeriesCompetitors, seriesEntries),
  );
  const countableEntryIds = countableSeriesEntryIds(competitorsForScoredRaces);
  const dncBasisSeriesEntries = seriesEntries.filter(entry => countableEntryIds.has(entry.id));
  const dncBasisEntriesById = new Map(dncBasisSeriesEntries.map(entry => [entry.id, entry]));

  const dncBasisRaces: PublishedRace[] = racesToScore.map(race => {
    const filteredCompetitors = competitorsForConfigRace(race, config, allSeriesCompetitors, seriesEntries);
    return {
      ...race,
      results: filteredCompetitors
        .filter(comp =>
          countableEntryIds.has(comp.seriesEntryId) &&
          isCountingCompetitorResultCode(comp.resultCode),
        )
        .map(comp => {
          const entry = dncBasisEntriesById.get(comp.seriesEntryId);
          if (!entry) return null;
          return {
            seriesEntryId: comp.seriesEntryId,
            competitorKey: mergeKeyFor(entry, mergeStrategy),
          };
        })
        .filter((result): result is { seriesEntryId: string; competitorKey: string } => result !== null)
        .map(result => ({
          seriesEntryId: result.seriesEntryId,
          competitorKey: result.competitorKey,
          rank: 0,
          boatClass: '',
          sailNumber: 0,
          helm: '',
          crew: '',
          club: '',
          personalHandicapBand: undefined,
          handicap: 0,
          laps: 0,
          startTime: race.scheduledStart,
          finishTime: race.scheduledStart,
          elapsedTime: 0,
          correctedTime: 0,
          points: 0,
          resultCode: 'DNC' as const,
        })),
    };
  });

  const dncPoints = computeDncPoints(dncPolicy, dncBasisRaces, dncBasisSeriesEntries, mergeStrategy);
  return { dncPoints, countableEntryIds };
}
