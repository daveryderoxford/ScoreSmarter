import { describe, expect, it } from 'vitest';
import {
  divisionById,
  entryDivisionIds,
  markerDivisionIds,
  publishedDivisionDefinitions,
  textDivisionNames,
} from './division';

describe('division helpers', () => {
  it('falls back from leftover series-entry tags as exact ids', () => {
    expect(entryDivisionIds({ tags: ['D-youth'] })).toEqual(['D-youth']);
    expect(entryDivisionIds({ divisions: ['D-gold'], tags: ['D-youth'] })).toEqual(['D-gold']);
    expect(entryDivisionIds({})).toEqual([]);
  });

  it('reads published division snapshots only', () => {
    const defs = [
      { id: 'D-abc', name: 'Youth', scoreAs: 'none' as const, display: { style: 'marker' as const } },
    ];
    expect(publishedDivisionDefinitions({ divisionDefinitions: defs })).toEqual(defs);
    expect(publishedDivisionDefinitions({})).toEqual([]);
  });

  it('splits text vs marker display by exact id', () => {
    const defs = [
      { id: 'D-gold', name: 'Gold', scoreAs: 'none' as const, display: { style: 'text' as const } },
      { id: 'D-youth', name: 'Youth', scoreAs: 'none' as const, display: { style: 'marker' as const } },
    ];
    expect(textDivisionNames(['D-gold', 'D-youth'], defs)).toEqual(['Gold']);
    expect(markerDivisionIds(['D-gold', 'D-youth'], defs)).toEqual(['D-youth']);
  });

  it('resolves divisions by exact id only', () => {
    const defs = [
      { id: 'D-abc', name: 'Youth', scoreAs: 'none' as const, display: { style: 'marker' as const } },
    ];
    expect(divisionById('D-abc', defs)?.name).toBe('Youth');
    expect(divisionById('youth', defs)).toBeUndefined();
    expect(divisionById('missing', defs)).toBeUndefined();
  });
});
