import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { Series } from 'app/race-calender';
import { DEFAULT_SHORT_DISCARDS } from 'app/scoring/model/discard-profile';
import type { HandicapConfiguration } from 'app/scoring/model/scoring-configuration';
import { calculatePersonalHandicapFromPy } from 'app/scoring/model/personal-handicap';
import { describe, expect, it } from 'vitest';
import type { SeriesEntry } from '../model/series-entry';
import {
  handicapsEqual,
  planSeriesEntryHandicapSync,
  recomputeEntryHandicapsFromClass,
} from './series-entry-handicap-sync';

function pyPrimary(): HandicapConfiguration {
  return {
    id: 'cfg-py',
    name: 'PY',
    fleet: { type: 'GeneralHandicap', id: 'f-general', name: 'General Handicap' },
    type: 'Handicap',
    handicapScheme: 'PY',
  };
}

function personalPrimary(): HandicapConfiguration {
  return {
    id: 'cfg-personal',
    name: 'Personal',
    fleet: { type: 'GeneralHandicap', id: 'f-general', name: 'General Handicap' },
    type: 'Handicap',
    handicapScheme: 'Personal',
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

function entry(overrides: Partial<SeriesEntry> = {}): SeriesEntry {
  return {
    id: 'se-1',
    seriesId: 'series-1',
    helm: 'Pat',
    boatClass: 'Laser',
    sailNumber: '100',
    handicaps: [{ scheme: 'PY', value: 999 }],
    tags: [],
    ...overrides,
  };
}

const clubClasses: BoatClass[] = [
  { id: 'c1', name: 'Laser', handicaps: [{ scheme: 'PY', value: 1100 }] },
  { id: 'c2', name: 'Solo', handicaps: [{ scheme: 'PY', value: 1150 }] },
];

describe('handicapsEqual', () => {
  it('compares schemes regardless of array order', () => {
    expect(
      handicapsEqual(
        [
          { scheme: 'IRC', value: 1 },
          { scheme: 'PY', value: 2 },
        ],
        [
          { scheme: 'PY', value: 2 },
          { scheme: 'IRC', value: 1 },
        ],
      ),
    ).toBe(true);
  });
});

describe('recomputeEntryHandicapsFromClass', () => {
  it('returns class PY when entry overrides differ', () => {
    const series = minimalSeries();
    const out = recomputeEntryHandicapsFromClass(series, entry(), clubClasses);
    expect(out).toEqual([{ scheme: 'PY', value: 1100 }]);
  });

  it('returns null for unknown boat class', () => {
    const series = minimalSeries();
    const out = recomputeEntryHandicapsFromClass(
      series,
      entry({ boatClass: 'Mystery' }),
      clubClasses,
    );
    expect(out).toBeNull();
  });

  it('preserves personal band when series uses Personal', () => {
    const series = minimalSeries({ primaryScoringConfiguration: personalPrimary() });
    const out = recomputeEntryHandicapsFromClass(
      series,
      entry({
        handicaps: [{ scheme: 'Personal', value: 1 }],
        personalHandicapBand: 'Band2',
      }),
      clubClasses,
    );
    expect(out).toEqual([
      {
        scheme: 'Personal',
        value: calculatePersonalHandicapFromPy(1100, 'Band2'),
      },
    ]);
  });
});

describe('planSeriesEntryHandicapSync', () => {
  it('classifies updated, unchanged, and skipped entries', () => {
    const series = minimalSeries();
    const plan = planSeriesEntryHandicapSync(
      series,
      [
        entry({ id: 'se-1', handicaps: [{ scheme: 'PY', value: 999 }] }),
        entry({ id: 'se-2', boatClass: 'Solo', handicaps: [{ scheme: 'PY', value: 1150 }] }),
        entry({ id: 'se-3', boatClass: 'Mystery', handicaps: [] }),
      ],
      clubClasses,
    );

    expect(plan.updated).toHaveLength(1);
    expect(plan.updated[0].entry.id).toBe('se-1');
    expect(plan.updated[0].handicaps).toEqual([{ scheme: 'PY', value: 1100 }]);
    expect(plan.unchanged).toBe(1);
    expect(plan.skippedUnknownClass).toBe(1);
    expect(plan.unknownClassNames).toEqual(['Mystery']);
  });
});
