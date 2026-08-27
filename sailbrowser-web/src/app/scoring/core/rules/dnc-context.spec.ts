import { describe, expect, it } from 'vitest';
import { buildDncContext } from './dnc-context';
import type { Race } from 'app/race-calender/model/race';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { HandicapConfiguration } from 'app/scoring/model/scoring-configuration';
import type { ResultCode } from 'app/scoring/model/result-code';
import type { DncCalculation } from 'app/club-tenant/model/club';

function race(id: string, index = 1): Race {
  return {
    id,
    seriesName: 'S',
    fleetId: 'f1',
    index,
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

const config: HandicapConfiguration = {
  id: 'cfg',
  name: 'Overall',
  type: 'Handicap',
  handicapScheme: 'PY',
  fleet: { id: 'f1', type: 'GeneralHandicap', name: 'General Handicap' },
};

function entry(id: string, sailNumber: string, helm = `Helm ${sailNumber}`): SeriesEntry {
  return {
    id,
    seriesId: 'series-1',
    helm,
    boatClass: 'Laser',
    sailNumber,
    handicaps: [{ scheme: 'PY', value: 1000 }],
    divisions: [],
  };
}

function comp(id: string, raceId: string, seriesEntryId: string, resultCode: ResultCode): RaceCompetitor {
  return new RaceCompetitor({ id, raceId, seriesId: 'series-1', seriesEntryId, resultCode });
}

function runDncContext(
  races: Race[],
  seriesEntries: SeriesEntry[],
  comps: RaceCompetitor[],
  dncPolicy: DncCalculation,
) {
  return buildDncContext({
    racesToScore: races,
    config,
    seriesEntries,
    allSeriesCompetitors: comps,
    mergeStrategy: 'classSailNumberHelm',
    dncPolicy,
  });
}

describe('buildDncContext', () => {
  it('excludes entries with only OOD rows from DNC counting domain (SeriesEntries basis)', () => {
    const seriesEntries = [entry('e1', '101', 'A'), entry('e2', '102', 'B')];
    const comps = [
      comp('c1', 'r1', 'e1', 'OOD'),
      comp('c2', 'r1', 'e2', 'OK'),
    ];
    const out = runDncContext(
      [race('r1')], seriesEntries, comps,
      { basis: 'SeriesEntries', offset: 1, excludeNeverRaced: false },
    );

    expect(out.countableEntryIds.has('e1')).toBe(false);
    expect(out.countableEntryIds.has('e2')).toBe(true);
    expect(out.dncPoints).toBe(2);
  });

  it('MaxRaceCompetitors basis ignores OOD rows when counting per-race competitors', () => {
    // Race r1: 4 OK finishers + 1 OOD. Per-race count must be 4 (OOD ignored),
    // so dncPoints = 4 + offset 1 = 5 (not 6).
    const seriesEntries = [
      entry('e1', '101'), entry('e2', '102'), entry('e3', '103'), entry('e4', '104'), entry('e5', '105'),
    ];
    const comps = [
      comp('c1', 'r1', 'e1', 'OK'),
      comp('c2', 'r1', 'e2', 'OK'),
      comp('c3', 'r1', 'e3', 'OK'),
      comp('c4', 'r1', 'e4', 'OK'),
      comp('c5', 'r1', 'e5', 'OOD'),
    ];
    const out = runDncContext(
      [race('r1')], seriesEntries, comps,
      { basis: 'MaxRaceCompetitors', offset: 1, excludeNeverRaced: false },
    );

    expect(out.countableEntryIds.has('e5')).toBe(false); // OOD-only entry is non-counting.
    expect(out.dncPoints).toBe(5);
  });

  it('MaxRaceCompetitors basis picks the largest *filtered* race', () => {
    // r1: 5 OK + 1 OOD (filtered = 5).  r2: 4 OK (filtered = 4).
    // dncPoints must reflect the larger race count after OOD filtering: 5 + 1 = 6.
    const seriesEntries = [
      entry('e1', '101'), entry('e2', '102'), entry('e3', '103'),
      entry('e4', '104'), entry('e5', '105'), entry('e6', '106'),
    ];
    const comps = [
      comp('c1a', 'r1', 'e1', 'OK'),
      comp('c2a', 'r1', 'e2', 'OK'),
      comp('c3a', 'r1', 'e3', 'OK'),
      comp('c4a', 'r1', 'e4', 'OK'),
      comp('c5a', 'r1', 'e5', 'OK'),
      comp('c6a', 'r1', 'e6', 'OOD'),
      comp('c1b', 'r2', 'e1', 'OK'),
      comp('c2b', 'r2', 'e2', 'OK'),
      comp('c3b', 'r2', 'e3', 'OK'),
      comp('c4b', 'r2', 'e4', 'OK'),
    ];
    const out = runDncContext(
      [race('r1', 1), race('r2', 2)], seriesEntries, comps,
      { basis: 'MaxRaceCompetitors', offset: 1, excludeNeverRaced: false },
    );

    expect(out.dncPoints).toBe(6);
  });

  it('MaxRaceCompetitors basis: a mixed-status entry counts only in the OK race', () => {
    // Helm A: OOD in r1, OK in r2.
    // r1: 3 OK + Helm A OOD -> filtered = 3.
    // r2: 4 OK (incl. Helm A) -> filtered = 5. WAIT - 4 OK boats other than A
    // would be 4 entries; A makes 5. Use 3 other OK in r2 + Helm A = 4 filtered.
    // Recheck: 3 other OK + Helm A OK = 4 in r2. r1 has 3 other OK + A's OOD = 3.
    // Max = 4 + offset 1 = 5.
    const seriesEntries = [
      entry('eA', '100', 'Helm A'),
      entry('e1', '101'), entry('e2', '102'), entry('e3', '103'),
    ];
    const comps = [
      // r1: e1, e2, e3 OK + eA OOD (3 countable rows in r1).
      comp('c1a', 'r1', 'e1', 'OK'),
      comp('c2a', 'r1', 'e2', 'OK'),
      comp('c3a', 'r1', 'e3', 'OK'),
      comp('cAa', 'r1', 'eA', 'OOD'),
      // r2: all four OK (4 countable rows in r2).
      comp('c1b', 'r2', 'e1', 'OK'),
      comp('c2b', 'r2', 'e2', 'OK'),
      comp('c3b', 'r2', 'e3', 'OK'),
      comp('cAb', 'r2', 'eA', 'OK'),
    ];
    const out = runDncContext(
      [race('r1', 1), race('r2', 2)], seriesEntries, comps,
      { basis: 'MaxRaceCompetitors', offset: 1, excludeNeverRaced: false },
    );

    // Helm A has at least one non-OOD result -> countable.
    expect(out.countableEntryIds.has('eA')).toBe(true);
    // Per-race count: r1 = 3 (A's OOD filtered), r2 = 4. Max = 4. + 1 = 5.
    expect(out.dncPoints).toBe(5);
  });

  it('SeriesEntries basis: a mixed-status entry is counted (one OK row is enough)', () => {
    const seriesEntries = [
      entry('eA', '100', 'Helm A'),
      entry('e1', '101'), entry('e2', '102'), entry('e3', '103'),
    ];
    const comps = [
      comp('c1a', 'r1', 'e1', 'OK'),
      comp('c2a', 'r1', 'e2', 'OK'),
      comp('c3a', 'r1', 'e3', 'OK'),
      comp('cAa', 'r1', 'eA', 'OOD'),
      comp('cAb', 'r2', 'eA', 'OK'),
    ];
    const out = runDncContext(
      [race('r1', 1), race('r2', 2)], seriesEntries, comps,
      { basis: 'SeriesEntries', offset: 1, excludeNeverRaced: false },
    );

    expect(out.countableEntryIds.has('eA')).toBe(true);
    // 4 countable entries + offset 1 = 5.
    expect(out.dncPoints).toBe(5);
  });

  it('falls back to the offset floor when every result code is OOD', () => {
    const seriesEntries = [entry('e1', '101')];
    const comps = [comp('c1', 'r1', 'e1', 'OOD')];
    const out = runDncContext(
      [race('r1')], seriesEntries, comps,
      { basis: 'MaxRaceCompetitors', offset: 2, excludeNeverRaced: false },
    );

    expect(out.countableEntryIds.size).toBe(0);
    // No countable competitor in any race -> max(1, 0 + offset) = 2.
    expect(out.dncPoints).toBe(2);
  });
});
