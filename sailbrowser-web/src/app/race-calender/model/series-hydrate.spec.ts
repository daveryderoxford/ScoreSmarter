import { describe, expect, it } from 'vitest';
import { discardTableFromLegacy } from 'app/scoring/model/discard-profile';
import type { Fleet } from 'app/club-tenant/model/fleet';
import type { HandicapConfiguration } from 'app/scoring/model/scoring-configuration';
import { hydrateSeriesFromFirestore } from './series-hydrate';
import type { Series } from './series';

function baseDoc(
  overrides: Partial<Series> &
    Partial<{ initialDiscardAfter: number; subsequentDiscardsEveryN: number }> = {},
): Parameters<typeof hydrateSeriesFromFirestore>[0] {
  const fleet: Fleet = { id: 'f1', type: 'GeneralHandicap', name: 'General Handicap' };
  const primary: HandicapConfiguration = {
    id: 'cfg',
    name: 'PY',
    fleet,
    type: 'Handicap',
    handicapScheme: 'PY',
  };
  return {
    id: 's1',
    seasonId: 'season',
    name: 'S',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'classSailNumberHelm',
    primaryScoringConfiguration: primary,
    ...overrides,
  };
}

describe('hydrateSeriesFromFirestore', () => {
  it('maps legacy discard pair to capped ladder when discards absent', () => {
    const s = hydrateSeriesFromFirestore(baseDoc({ initialDiscardAfter: 4, subsequentDiscardsEveryN: 3 }));
    expect(s).not.toHaveProperty('initialDiscardAfter');
    expect(s.discards.slice(0, 7)).toEqual([0, 0, 0, 1, 1, 1, 2]);
    expect(s.discards.length).toBeGreaterThan(32);
  });

  it('keeps explicit discards array and does not expose legacy keys on result object', () => {
    const s = hydrateSeriesFromFirestore(
      baseDoc({
        discards: [0, 0, 5],
        initialDiscardAfter: 4,
        subsequentDiscardsEveryN: 3,
      }),
    );
    expect(s.discards).toEqual([0, 0, 5]);
  });

  it('matches standalone legacy formula helper for sampled inputs', () => {
    const raw = baseDoc({ initialDiscardAfter: 3, subsequentDiscardsEveryN: 2 });
    const s = hydrateSeriesFromFirestore(raw);
    expect(s.discards.slice(0, 10)).toEqual(discardTableFromLegacy(3, 2, 10));
  });
});
