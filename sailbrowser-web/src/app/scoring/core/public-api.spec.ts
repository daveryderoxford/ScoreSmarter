import { describe, expect, it } from 'vitest';
import { scoreSeriesSnapshot } from './public-api';
import { score } from 'app/scoring/services/scorer';
import type { Race } from 'app/race-calender/model/race';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import type { ScoringConfig } from 'app/scoring/services/series-scorer';

describe('scoreSeriesSnapshot', () => {
  it('matches scorer orchestrator behavior for same inputs', () => {
    const race: Race = {
      id: 'race-1',
      seriesName: 'S',
      fleetId: 'f1',
      index: 1,
      seriesId: 'series-1',
      scheduledStart: new Date('2025-01-01T10:00:00Z'),
      raceOfDay: 1,
      type: 'Handicap',
      status: 'Completed',
      isDiscardable: true,
      isAverageLap: false,
      dirty: false,
      resultsSheetImage: '',
    };
    const entries: SeriesEntry[] = [
      { id: 'e1', seriesId: 'series-1', helm: 'A', boatClass: 'Laser', sailNumber: 101, handicaps: [{ scheme: 'PY', value: 1000 }], tags: [] },
      { id: 'e2', seriesId: 'series-1', helm: 'B', boatClass: 'Laser', sailNumber: 102, handicaps: [{ scheme: 'PY', value: 1000 }], tags: [] },
    ];
    const competitors = [
      new RaceCompetitor({
        id: 'c1',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e1',
        startTime: new Date('2025-01-01T10:00:00Z'),
        manualFinishTime: new Date('2025-01-01T10:10:00Z'),
        resultCode: 'OK',
      }),
      new RaceCompetitor({
        id: 'c2',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e2',
        startTime: new Date('2025-01-01T10:00:00Z'),
        manualFinishTime: new Date('2025-01-01T10:11:00Z'),
        resultCode: 'OK',
      }),
    ];
    const config: ScoringConfig = { seriesType: 'short', discards: 0, dncPoints: 3 };
    const scoringConfiguration = {
      id: 'overall',
      name: 'Overall',
      type: 'Handicap' as const,
      fleet: { id: 'f1', type: 'GeneralHandicap' as const, name: 'General Handicap' as const },
      handicapScheme: 'PY' as const,
    };

    const viaApi = scoreSeriesSnapshot({
      raceToScore: race,
      competitorsInRace: competitors,
      existingScoredRaces: [],
      seriesEntries: entries,
      config,
      scoringConfiguration,
      mergeStrategy: 'classSailNumberHelm',
    });
    const direct = score(
      race,
      competitors,
      [],
      entries,
      config,
      scoringConfiguration,
      'classSailNumberHelm',
    );

    expect(viaApi).toEqual(direct);
  });
});
