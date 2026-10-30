import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { RatingList } from 'app/club-tenant/model/rating-list';
import type { Fleet } from 'app/club-tenant/model/fleet';
import type { Series } from 'app/race-calender';
import { DEFAULT_SHORT_DISCARDS } from 'app/scoring/model/discard-profile';
import { describe, expect, it } from 'vitest';
import { getHandicapSchemeMetadata } from '../../scoring/model/handicap-scheme-metadata';
import type { HandicapConfiguration, LevelRatingConfiguration } from '../../scoring/model/scoring-configuration';
import {
  entryClubForCategory,
  hostClubLabel,
  meetsPrimaryFleetEligibility,
  resolveHandicapsForSeries,
} from './entry-helpers';

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
    discards: [...DEFAULT_SHORT_DISCARDS],
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
      classes,
      [],
    );
    expect(out).toEqual([{ scheme: 'PY', value: 1050 }]);
  });

  it('uses class handicaps when no override', () => {
    const series = minimalSeries();
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1122 }] },
    ];
    const out = resolveHandicapsForSeries(series, { boatClassName: 'Laser' }, classes, []);
    expect(out).toEqual([{ scheme: 'PY', value: 1122 }]);
  });

  it('uses metadata default for boat-level scheme when missing from class and overrides', () => {
    const series = minimalSeries({
      primaryScoringConfiguration: ircSecondary(),
    });
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1000 }] },
    ];
    const out = resolveHandicapsForSeries(series, { boatClassName: 'Laser' }, classes, []);
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
    const out = resolveHandicapsForSeries(series, { boatClassName: 'Laser' }, classes, []);
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
      classes,
      [],
    );
    expect(out).toEqual([{ scheme: 'PY', value: getHandicapSchemeMetadata('PY').defaultValue }]);
  });

  it('uses the PY list in force on the series start date for RYA classes', () => {
    const ilca: BoatClass = { id: 'rya-191', name: 'ILCA 7', kind: 'rya', catalogueId: 191, handicaps: [{ scheme: 'PY', value: 1110 }] };
    const lists: RatingList[] = [
      { id: 'pn-2026', scheme: 'PY', issuer: 'RYA', name: 'PN 2026', effectiveFrom: new Date('2026-03-01'), ratings: { 191: 1100 } },
      { id: 'pn-2027', scheme: 'PY', issuer: 'RYA', name: 'PN 2027', effectiveFrom: new Date('2027-03-01'), ratings: { 191: 1095 } },
    ];
    const winter = minimalSeries({ startDate: new Date('2026-10-04') });
    const summer = minimalSeries({ startDate: new Date('2027-04-04') });
    expect(resolveHandicapsForSeries(winter, { boatClassName: 'ILCA 7' }, [ilca], lists)).toEqual([{ scheme: 'PY', value: 1100 }]);
    expect(resolveHandicapsForSeries(summer, { boatClassName: 'ILCA 7' }, [ilca], lists)).toEqual([{ scheme: 'PY', value: 1095 }]);
    const overridden = { ...ilca, overriddenSchemes: ['PY' as const] };
    expect(resolveHandicapsForSeries(summer, { boatClassName: 'ILCA 7' }, [overridden], lists)).toEqual([{ scheme: 'PY', value: 1110 }]);
  });

  it('includes Level Rating from LevelRating primary', () => {
    const series = minimalSeries({ primaryScoringConfiguration: levelRatingPrimary() });
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'Level Rating', value: 1.05 }] },
    ];
    const out = resolveHandicapsForSeries(series, { boatClassName: 'Laser' }, classes, []);
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
    discards: [...DEFAULT_SHORT_DISCARDS],
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
  it('matches GeneralHandicap even when the handicap is missing', () => {
    const series = eligibilitySeries({ type: 'GeneralHandicap', id: 'f1', name: 'General Handicap' }, 'PY');
    expect(
      meetsPrimaryFleetEligibility(series, {
        boatClass: 'Laser',
        handicaps: [],
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
});

describe('hostClubLabel / entryClubForCategory', () => {
  it('prefers shortName over full name', () => {
    expect(hostClubLabel({ name: 'Hayling Island Sailing Club', shortName: 'HYC' })).toBe('HYC');
  });

  it('falls back to name when shortName is blank', () => {
    expect(hostClubLabel({ name: 'Hayling Island Sailing Club', shortName: '  ' })).toBe(
      'Hayling Island Sailing Club',
    );
  });

  it('uses host label for member and club categories', () => {
    const host = { name: 'Hayling Island Sailing Club', shortName: 'HYC' };
    expect(entryClubForCategory('member', 'ignored', host)).toBe('HYC');
    expect(entryClubForCategory('club', '', host)).toBe('HYC');
  });

  it('uses optional visitor club text', () => {
    const host = { name: 'Hayling Island Sailing Club', shortName: 'HYC' };
    expect(entryClubForCategory('visitor', '  WSC  ', host)).toBe('WSC');
    expect(entryClubForCategory('visitor', '   ', host)).toBeUndefined();
  });
});
