import { describe, expect, it } from 'vitest';
import type { Race } from 'app/race-calender/model/race';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import type { HandicapConfiguration } from 'app/scoring/model/scoring-configuration';
import { competitorsForConfigRace, doesRaceRequireHandicap, isRaceScorable } from './scoring-publish-filters';

const pyConfig: HandicapConfiguration = {
  id: 'cfg-py',
  name: 'PY',
  fleet: { type: 'GeneralHandicap', id: 'f-general', name: 'General Handicap' },
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

function comp(id: string, seriesEntryId: string, resultCode: RaceCompetitor['resultCode'] = 'NOT FINISHED'): RaceCompetitor {
  return new RaceCompetitor({
    id,
    raceId: 'race-1',
    seriesId: 'series-1',
    seriesEntryId,
    resultCode,
  });
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

describe('scoring-publish-filters', () => {
  const race1 = minimalRace('race-1');

  it('requires handicap only for handicap races', () => {
    expect(doesRaceRequireHandicap('Handicap')).toBe(true);
    expect(doesRaceRequireHandicap('Pursuit')).toBe(false);
    expect(doesRaceRequireHandicap('Level Rating')).toBe(false);
  });

  it('GeneralHandicap fleet: scorable whenever there are in-fleet rows (race status is enforced in ScoringEngine)', () => {
    const entries = [entry({ id: 'e1' }), entry({ id: 'e2', sailNumber: 101 })];
    const comps = [comp('c1', 'e1'), comp('c2', 'e2')];

    expect(isRaceScorable(race1, pyConfig, comps, entries)).toBe(true);
  });

  it('returns true when at least one competitor has a non–NOT FINISHED code', () => {
    const entries = [entry({ id: 'e1' }), entry({ id: 'e2', sailNumber: 101 })];
    const comps = [comp('c1', 'e1'), comp('c2', 'e2', 'DNF')];

    expect(isRaceScorable(race1, pyConfig, comps, entries)).toBe(true);
  });

  it('returns true when there are no in-fleet rows for this fleet (vacuous)', () => {
    const entries = [entry({ id: 'e1', boatClass: 'Laser' })];
    const comps = [comp('c1', 'e1')];

    expect(isRaceScorable(race1, optimistFleetConfig, comps, entries)).toBe(true);
    expect(competitorsForConfigRace(race1, optimistFleetConfig, comps, entries)).toHaveLength(0);
  });

  it('only considers competitors in the configured fleet for BoatClass config', () => {
    const entries = [
      entry({ id: 'e-laser', boatClass: 'Laser' }),
      entry({ id: 'e-optimist', boatClass: 'Optimist', sailNumber: 102, helm: 'O' }),
    ];
    const comps = [comp('c1', 'e-laser'), comp('c2', 'e-optimist', 'OK')];

    expect(isRaceScorable(race1, laserFleetConfig, comps, entries)).toBe(false);
  });

  it('includes pursuit competitors without the scoring handicap', () => {
    const pursuitRace: Race = { ...race1, type: 'Pursuit' };
    const entries = [
      entry({ id: 'e1', handicaps: [] }),
      entry({ id: 'e2', sailNumber: 101 }),
    ];
    const comps = [comp('c1', 'e1', 'OK'), comp('c2', 'e2')];

    expect(competitorsForConfigRace(pursuitRace, pyConfig, comps, entries)).toHaveLength(2);
    expect(isRaceScorable(pursuitRace, pyConfig, comps, entries)).toBe(true);
  });

  it('includes level rating competitors without the scoring handicap', () => {
    const levelRatingRace: Race = { ...race1, type: 'Level Rating' };
    const entries = [entry({ id: 'e-laser', boatClass: 'Laser', handicaps: [] })];
    const comps = [comp('c1', 'e-laser', 'OK')];

    expect(competitorsForConfigRace(levelRatingRace, laserFleetConfig, comps, entries)).toHaveLength(1);
    expect(isRaceScorable(levelRatingRace, laserFleetConfig, comps, entries)).toBe(true);
  });
});
