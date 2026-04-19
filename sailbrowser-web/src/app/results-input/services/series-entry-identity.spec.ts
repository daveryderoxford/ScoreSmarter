import { describe, expect, it } from 'vitest';
import type { SeriesEntry } from '../model/series-entry';
import {
  PerHullIdentity,
  describeIdentity,
  detectInRaceConflict,
  entriesMatchIdentity,
  findAllMatchingEntries,
  findCollidingEntry,
} from './series-entry-identity';

function entry(over: Partial<SeriesEntry> & Pick<SeriesEntry, 'id'>): SeriesEntry {
  return {
    seriesId: 's1',
    helm: 'Helm',
    boatClass: 'ILCA 7',
    sailNumber: 100,
    handicaps: [],
    ...over,
  };
}

describe('entriesMatchIdentity', () => {
  it('returns true for identical normalised tuples', () => {
    const a: PerHullIdentity = { boatClass: 'ILCA 7', sailNumber: 100, helm: 'Sam' };
    const b: PerHullIdentity = { boatClass: 'ILCA 7', sailNumber: 100, helm: 'Sam' };
    expect(entriesMatchIdentity(a, b)).toBe(true);
  });

  it('normalises case and surrounding whitespace on helm and class', () => {
    const a: PerHullIdentity = { boatClass: 'ILCA 7', sailNumber: 100, helm: 'Sam Skipper' };
    const b: PerHullIdentity = { boatClass: '  ilca 7 ', sailNumber: 100, helm: ' SAM skipper ' };
    expect(entriesMatchIdentity(a, b)).toBe(true);
  });

  it('treats different sail numbers as different identities', () => {
    const a: PerHullIdentity = { boatClass: 'ILCA 7', sailNumber: 100, helm: 'Sam' };
    const b: PerHullIdentity = { boatClass: 'ILCA 7', sailNumber: 200, helm: 'Sam' };
    expect(entriesMatchIdentity(a, b)).toBe(false);
  });

  it('treats different helms as different identities even with shared hull', () => {
    const a: PerHullIdentity = { boatClass: 'ILCA 7', sailNumber: 100, helm: 'Sam' };
    const b: PerHullIdentity = { boatClass: 'ILCA 7', sailNumber: 100, helm: 'Bob' };
    expect(entriesMatchIdentity(a, b)).toBe(false);
  });
});

describe('findCollidingEntry', () => {
  const entries: SeriesEntry[] = [
    entry({ id: 'e1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100 }),
    entry({ id: 'e2', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100 }),
    entry({ id: 'e3', helm: 'Sam', boatClass: 'RS Aero 7', sailNumber: 200 }),
  ];

  it('finds the matching entry when one exists', () => {
    const hit = findCollidingEntry(entries, { helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100 });
    expect(hit?.id).toBe('e2');
  });

  it('returns undefined when no entry matches', () => {
    const hit = findCollidingEntry(entries, { helm: 'New', boatClass: 'ILCA 7', sailNumber: 999 });
    expect(hit).toBeUndefined();
  });

  it('skips the excluded entry id (in-place rename support)', () => {
    // 'e1' would otherwise collide with itself; excludeId hides it.
    const hit = findCollidingEntry(
      entries,
      { helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100 },
      'e1',
    );
    expect(hit).toBeUndefined();
  });

  it('still finds OTHER colliding entries when an unrelated id is excluded', () => {
    // Excluding e3 must not hide the real collision against e2.
    const hit = findCollidingEntry(
      entries,
      { helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100 },
      'e3',
    );
    expect(hit?.id).toBe('e2');
  });
});

describe('findAllMatchingEntries', () => {
  it('returns an empty array when nothing matches', () => {
    const entries: SeriesEntry[] = [
      entry({ id: 'e1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100 }),
    ];
    expect(findAllMatchingEntries(entries, { helm: 'Other', boatClass: 'ILCA 7', sailNumber: 100 }))
      .toEqual([]);
  });

  it('returns all corrupt-state matches so callers can refuse to write', () => {
    const entries: SeriesEntry[] = [
      entry({ id: 'e1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100 }),
      entry({ id: 'e2', helm: 'sam', boatClass: 'ILCA 7', sailNumber: 100 }),
    ];
    const matches = findAllMatchingEntries(entries, { helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100 });
    expect(matches.map(e => e.id)).toEqual(['e1', 'e2']);
  });
});

describe('detectInRaceConflict', () => {
  const sam: PerHullIdentity = { helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100 };
  const samAero: PerHullIdentity = { helm: 'Sam', boatClass: 'RS Aero 7', sailNumber: 200 };
  const bobSameHull: PerHullIdentity = { helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100 };
  const unrelated: PerHullIdentity = { helm: 'Eve', boatClass: 'RS Aero 9', sailNumber: 999 };

  it('always reports sameEntry for identity duplicates regardless of strategy', () => {
    for (const strat of ['classSailNumberHelm', 'classSailNumber', 'helm', 'regatta'] as const) {
      expect(detectInRaceConflict(sam, sam, strat)).toBe('sameEntry');
    }
  });

  it('classSailNumberHelm/regatta only conflict on identity', () => {
    expect(detectInRaceConflict(sam, samAero, 'classSailNumberHelm')).toBeNull();
    expect(detectInRaceConflict(sam, bobSameHull, 'classSailNumberHelm')).toBeNull();
    expect(detectInRaceConflict(sam, samAero, 'regatta')).toBeNull();
    expect(detectInRaceConflict(sam, bobSameHull, 'regatta')).toBeNull();
  });

  it('helm strategy flags same helm on a different hull', () => {
    expect(detectInRaceConflict(sam, samAero, 'helm')).toBe('sameHelmDifferentHull');
  });

  it('helm strategy ignores same hull with different helm (that is fine in merged-helm scoring)', () => {
    expect(detectInRaceConflict(sam, bobSameHull, 'helm')).toBeNull();
  });

  it('classSailNumber strategy flags same hull with different helm', () => {
    expect(detectInRaceConflict(sam, bobSameHull, 'classSailNumber')).toBe('sameHullDifferentHelm');
  });

  it('classSailNumber strategy ignores same helm on a different hull', () => {
    expect(detectInRaceConflict(sam, samAero, 'classSailNumber')).toBeNull();
  });

  it('returns null for completely unrelated entries on every strategy', () => {
    for (const strat of ['classSailNumberHelm', 'classSailNumber', 'helm', 'regatta'] as const) {
      expect(detectInRaceConflict(sam, unrelated, strat)).toBeNull();
    }
  });
});

describe('describeIdentity', () => {
  it('produces a human-friendly summary used in error messages', () => {
    expect(describeIdentity({ helm: 'Sam Skipper', boatClass: 'ILCA 7', sailNumber: 12345 }))
      .toBe('Sam Skipper / ILCA 7 #12345');
  });
});
