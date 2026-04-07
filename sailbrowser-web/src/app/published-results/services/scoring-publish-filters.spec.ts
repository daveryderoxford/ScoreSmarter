import { describe, expect, it } from 'vitest';
import type { Race } from 'app/race-calender/model/race';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import type { HandicapConfiguration } from 'app/scoring/model/scoring-configuration';
import { competitorsForConfigRace, isRaceScorable } from './scoring-publish-filters';

const pyConfig: HandicapConfiguration = {
  id: 'cfg-py',
  name: 'PY',
  fleet: { type: 'All', id: 'f-all', name: 'All competitors' },
  type: 'Handicap',
  handicapScheme: 'PY',
};

const laserFleetConfig: HandicapConfiguration = {
  id: 'cfg-laser',
  name: 'Laser',
  fleet: { type: 'BoatClass', id: 'fleet-laser', boatClassId: 'Laser' },
  type: 'Handicap',
  handicapScheme: 'PY',
};

/** No series entry uses this boat class — filtered competitors list is empty. */
const optimistFleetConfig: HandicapConfiguration = {
  id: 'cfg-opt',
  name: 'Optimist',
  fleet: { type: 'BoatClass', id: 'fleet-opt', boatClassId: 'Optimist' },
  type: 'Handicap',
  handicapScheme: 'PY',
};

function entry(overrides: Partial<SeriesEntry> & Pick<SeriesEntry, 'id'>): SeriesEntry {
  return {
    seriesId: 'series-1',
    helm: 'Helm',
    boatClass: 'Laser',
    sailNumber: 100,
    handicaps: [{ scheme: 'PY', value: 1100 }],
    ...overrides,
  };
}

function minimalRace(id: string): Race {
  return {
    id,
    seriesName: 'S',
    fleetId: 'f1',
    index: 1,
    seriesId: 'series-1',
    scheduledStart: new Date(),
    raceOfDay: 1,
    type: 'Handicap',
    status: 'Future',
    isDiscardable: true,
    isAverageLap: false,
    dirty: false,
  };
}

describe('scoring-publish-filters (all–NOT FINISHED race exclusion)', () => {
  const race1 = minimalRace('race-1');

  it('returns false when every in-fleet competitor is NOT FINISHED', () => {
    const entries = [entry({ id: 'e1' }), entry({ id: 'e2', sailNumber: 101 })];
    const comps = [
      new RaceCompetitor({
        id: 'c1',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e1',
        handicaps: [{ scheme: 'PY', value: 1100 }],
        resultCode: 'NOT FINISHED',
      }),
      new RaceCompetitor({
        id: 'c2',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e2',
        handicaps: [{ scheme: 'PY', value: 1100 }],
        resultCode: 'NOT FINISHED',
      }),
    ];

    expect(isRaceScorable(race1, pyConfig, comps, entries)).toBe(false);
  });

  it('returns true when at least one competitor has a non–NOT FINISHED code', () => {
    const entries = [entry({ id: 'e1' }), entry({ id: 'e2', sailNumber: 101 })];
    const comps = [
      new RaceCompetitor({
        id: 'c1',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e1',
        handicaps: [{ scheme: 'PY', value: 1100 }],
        resultCode: 'NOT FINISHED',
      }),
      new RaceCompetitor({
        id: 'c2',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e2',
        handicaps: [{ scheme: 'PY', value: 1100 }],
        resultCode: 'DNF',
      }),
    ];

    expect(isRaceScorable(race1, pyConfig, comps, entries)).toBe(true);
  });

  it('returns true when there are no in-fleet rows for this fleet (vacuous)', () => {
    const entries = [entry({ id: 'e1', boatClass: 'Laser' })];
    const comps = [
      new RaceCompetitor({
        id: 'c1',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e1',
        handicaps: [{ scheme: 'PY', value: 1100 }],
        resultCode: 'NOT FINISHED',
      }),
    ];

    expect(isRaceScorable(race1, optimistFleetConfig, comps, entries)).toBe(true);
    expect(competitorsForConfigRace(race1, optimistFleetConfig, comps, entries)).toHaveLength(0);
  });

  it('only considers competitors in the configured fleet for BoatClass config', () => {
    const entries = [
      entry({ id: 'e-laser', boatClass: 'Laser' }),
      entry({ id: 'e-optimist', boatClass: 'Optimist', sailNumber: 102, helm: 'O' }),
    ];
    const comps = [
      new RaceCompetitor({
        id: 'c1',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e-laser',
        boatClass: 'Laser',
        handicaps: [{ scheme: 'PY', value: 1100 }],
        resultCode: 'NOT FINISHED',
      }),
      new RaceCompetitor({
        id: 'c2',
        raceId: 'race-1',
        seriesId: 'series-1',
        seriesEntryId: 'e-optimist',
        boatClass: 'Optimist',
        handicaps: [{ scheme: 'PY', value: 1200 }],
        resultCode: 'OK',
      }),
    ];

    expect(isRaceScorable(race1, laserFleetConfig, comps, entries)).toBe(false);
  });
});
