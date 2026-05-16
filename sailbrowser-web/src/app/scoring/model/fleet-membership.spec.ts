import { describe, expect, it } from 'vitest';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import type { TagFleet } from 'app/club-tenant/model/fleet';
import { entryHasTagFleetValue, isInFleet } from './fleet-membership';

function entry(tags: string[]): SeriesEntry {
  return {
    id: 'e1',
    seriesId: 's1',
    helm: 'Helm',
    boatClass: 'Laser',
    sailNumber: 100,
    handicaps: [],
    tags,
  };
}

const youthFleet: TagFleet = {
  type: 'Tag',
  id: 'youth-xWgxDxw0J',
  name: 'Youth',
  value: 'Youth',
};

describe('entryHasTagFleetValue', () => {
  it('matches tag id exactly', () => {
    expect(entryHasTagFleetValue(entry(['youth']), 'youth')).toBe(true);
  });

  it('matches tag id case-insensitively when fleet value used display label', () => {
    expect(entryHasTagFleetValue(entry(['youth']), 'Youth')).toBe(true);
  });

  it('returns false when tag is not on the entry', () => {
    expect(entryHasTagFleetValue(entry(['gold']), 'youth')).toBe(false);
  });
});

describe('isInFleet Tag fleet', () => {
  it('includes youth-tagged entries when fleet.value is legacy label "Youth"', () => {
    expect(isInFleet(entry(['youth']), youthFleet)).toBe(true);
  });
});
