import { describe, expect, it } from 'vitest';
import type { Fleet } from 'app/club-tenant/model/fleet';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { Series } from 'app/race-calender';
import type { HandicapConfiguration, LevelRatingConfiguration } from '../../scoring/model/scoring-configuration';
import { getHandicapSchemeMetadata } from '../../scoring/model/handicap-scheme-metadata';
import { meetsPrimaryFleetEligibility, resolveHandicapsForSeries } from './entry-helpers';

const testFleet: Fleet = { type: 'GeneralHandicap', id: 'f-general', name: 'General Handicap' };

function pyPrimary(): HandicapConfiguration {
  return {
    id: 'cfg-py',
    name: 'PY',
    fleet: testFleet,
    type: 'Handicap',
    handicapScheme: 'PY',
  };
}

function ircSecondary(): HandicapConfiguration {
  return {
    id: 'cfg-irc',
    name: 'IRC',
    fleet: testFleet,
    type: 'Handicap',
    handicapScheme: 'IRC',
  };
}

function levelRatingPrimary(): LevelRatingConfiguration {
  return {
    id: 'cfg-lr',
    name: 'LR',
    fleet: testFleet,
    type: 'LevelRating',
    handicapScheme: 'Level Rating',
  };
}

function minimalSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 'series-1',
    seasonId: 'season-1',
    name: 'Test Series',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'classSailNumberHelm',
    initialDiscardAfter: 0,
    subsequentDiscardsEveryN: 999,
    primaryScoringConfiguration: pyPrimary(),
    ...overrides,
  } as Series;
}

describe('resolveHandicapsForSeries', () => {
  it('prefers override from entry handicaps over class', () => {
    const series = minimalSeries();
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1100 }] },
    ];
    const out = resolveHandicapsForSeries(
      series,
      { boatClassName: 'Laser', handicaps: [{ scheme: 'PY', value: 1050 }] },
      classes
    );
    expect(out).toEqual([{ scheme: 'PY', value: 1050 }]);
  });

  it('uses class handicaps when no override', () => {
    const series = minimalSeries();
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1122 }] },
    ];
    const out = resolveHandicapsForSeries(series, { boatClassName: 'Laser' }, classes);
    expect(out).toEqual([{ scheme: 'PY', value: 1122 }]);
  });

  it('uses metadata default for boat-level scheme when missing from class and overrides', () => {
    const series = minimalSeries({
      primaryScoringConfiguration: ircSecondary(),
    });
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1000 }] },
    ];
    const out = resolveHandicapsForSeries(series, { boatClassName: 'Laser' }, classes);
    expect(out).toEqual([{ scheme: 'IRC', value: getHandicapSchemeMetadata('IRC').defaultValue }]);
  });

  it('does not use PY as fallback for unrelated schemes (multi-scheme series)', () => {
    const series = minimalSeries({
      primaryScoringConfiguration: pyPrimary(),
      secondaryScoringConfigurations: [ircSecondary()],
    });
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1005 }] },
    ];
    const out = resolveHandicapsForSeries(series, { boatClassName: 'Laser' }, classes);
    const py = out.find(h => h.scheme === 'PY');
    const irc = out.find(h => h.scheme === 'IRC');
    expect(py?.value).toBe(1005);
    expect(irc?.value).toBe(getHandicapSchemeMetadata('IRC').defaultValue);
  });

  it('replaces non-positive override with metadata default', () => {
    const series = minimalSeries();
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1100 }] },
    ];
    const out = resolveHandicapsForSeries(
      series,
      { boatClassName: 'Laser', handicaps: [{ scheme: 'PY', value: 0 }] },
      classes
    );
    expect(out).toEqual([{ scheme: 'PY', value: getHandicapSchemeMetadata('PY').defaultValue }]);
  });

  it('includes Level Rating from LevelRating primary', () => {
    const series = minimalSeries({ primaryScoringConfiguration: levelRatingPrimary() });
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'Level Rating', value: 1.05 }] },
    ];
    const out = resolveHandicapsForSeries(series, { boatClassName: 'Laser' }, classes);
    expect(out).toEqual([{ scheme: 'Level Rating', value: 1.05 }]);
  });
});

function eligibilitySeries(fleet: Fleet, handicapScheme: HandicapConfiguration['handicapScheme']): Series {
  return {
    id: 'series-1',
    seasonId: 'season-1',
    name: 'Series',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'classSailNumberHelm',
    initialDiscardAfter: 0,
    subsequentDiscardsEveryN: 999,
    primaryScoringConfiguration: {
      id: 'cfg-1',
      name: 'Primary',
      type: 'Handicap',
      handicapScheme,
      fleet,
    } as HandicapConfiguration,
  } as Series;
}

describe('meetsPrimaryFleetEligibility', () => {
  it('matches GeneralHandicap using config handicap scheme', () => {
    const series = eligibilitySeries({ type: 'GeneralHandicap', id: 'f1', name: 'General Handicap' }, 'PY');
    expect(
      meetsPrimaryFleetEligibility(series, {
        boatClass: 'Laser',
        handicaps: [{ scheme: 'PY', value: 1090 }],
      })
    ).toBe(true);
  });

  it('matches BoatClass by boat class id', () => {
    const series = eligibilitySeries({ type: 'BoatClass', id: 'f2', boatClassId: 'Laser' }, 'PY');
    expect(meetsPrimaryFleetEligibility(series, { boatClass: 'Laser', handicaps: [] })).toBe(true);
    expect(meetsPrimaryFleetEligibility(series, { boatClass: 'Solo', handicaps: [] })).toBe(false);
  });

  it('matches HandicapRange by value bounds', () => {
    const series = eligibilitySeries({ type: 'HandicapRange', id: 'f3', name: 'Mid', scheme: 'PY', min: 1000, max: 1150 }, 'PY');
    expect(
      meetsPrimaryFleetEligibility(series, {
        boatClass: 'Laser',
        handicaps: [{ scheme: 'PY', value: 1100 }],
      })
    ).toBe(true);
    expect(
      meetsPrimaryFleetEligibility(series, {
        boatClass: 'Laser',
        handicaps: [{ scheme: 'PY', value: 1200 }],
      })
    ).toBe(false);
  });

  it('returns false for Tag fleet primary eligibility in entry UI', () => {
    const series = eligibilitySeries({ type: 'Tag', id: 'f4', name: 'Novice', value: 'Novice' }, 'PY');
    expect(meetsPrimaryFleetEligibility(series, { boatClass: 'Laser', handicaps: [] })).toBe(false);
  });
});
