import { describe, expect, it } from 'vitest';
import { buildDncContext } from './dnc-context';
import type { Race } from 'app/race-calender/model/race';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { HandicapConfiguration } from 'app/scoring/model/scoring-configuration';

function race(id: string): Race {
  return {
    id,
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
}

describe('buildDncContext', () => {
  it('excludes entries with only OOD rows from DNC counting domain', () => {
    const races = [race('r1')];
    const config: HandicapConfiguration = {
      id: 'cfg',
      name: 'Overall',
      type: 'Handicap',
      handicapScheme: 'PY',
      fleet: { id: 'f1', type: 'GeneralHandicap', name: 'General Handicap' },
    };
    const seriesEntries: SeriesEntry[] = [
      { id: 'e1', seriesId: 'series-1', helm: 'A', boatClass: 'Laser', sailNumber: 101, handicaps: [{ scheme: 'PY', value: 1000 }] },
      { id: 'e2', seriesId: 'series-1', helm: 'B', boatClass: 'Laser', sailNumber: 102, handicaps: [{ scheme: 'PY', value: 1000 }] },
    ];
    const comps = [
      new RaceCompetitor({ id: 'c1', raceId: 'r1', seriesId: 'series-1', seriesEntryId: 'e1', resultCode: 'OOD' }),
      new RaceCompetitor({ id: 'c2', raceId: 'r1', seriesId: 'series-1', seriesEntryId: 'e2', resultCode: 'OK' }),
    ];
    const out = buildDncContext({
      racesToScore: races,
      config,
      seriesEntries,
      allSeriesCompetitors: comps,
      mergeStrategy: 'classSailNumberHelm',
      dncPolicy: { basis: 'SeriesEntries', offset: 1, excludeNeverRaced: false },
    });

    expect(out.countableEntryIds.has('e1')).toBe(false);
    expect(out.countableEntryIds.has('e2')).toBe(true);
    expect(out.dncPoints).toBe(2);
  });
});
