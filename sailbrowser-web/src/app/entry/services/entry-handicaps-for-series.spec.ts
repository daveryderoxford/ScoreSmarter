import { describe, expect, it } from 'vitest';
import type { Fleet } from 'app/club-tenant/model/fleet';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { Series } from 'app/race-calender';
import type { HandicapConfiguration, LevelRatingConfiguration } from '../../scoring/model/scoring-configuration';
import { getHandicapSchemeMetadata } from '../../scoring/model/handicap-scheme-metadata';
import { buildHandicapsForSeriesEntry } from './entry-handicaps-for-series';

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

describe('buildHandicapsForSeriesEntry', () => {
  it('prefers override from entry handicaps over class', () => {
    const series = minimalSeries();
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1100 }] },
    ];
    const out = buildHandicapsForSeriesEntry(
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
    const out = buildHandicapsForSeriesEntry(series, { boatClassName: 'Laser' }, classes);
    expect(out).toEqual([{ scheme: 'PY', value: 1122 }]);
  });

  it('uses metadata default for boat-level scheme when missing from class and overrides', () => {
    const series = minimalSeries({
      primaryScoringConfiguration: ircSecondary(),
    });
    const classes: BoatClass[] = [
      { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1000 }] },
    ];
    const out = buildHandicapsForSeriesEntry(series, { boatClassName: 'Laser' }, classes);
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
    const out = buildHandicapsForSeriesEntry(series, { boatClassName: 'Laser' }, classes);
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
    const out = buildHandicapsForSeriesEntry(
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
    const out = buildHandicapsForSeriesEntry(series, { boatClassName: 'Laser' }, classes);
    expect(out).toEqual([{ scheme: 'Level Rating', value: 1.05 }]);
  });
});
