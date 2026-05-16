import { describe, expect, it } from 'vitest';
import { buildTagDefinitionSnapshot, mergeTagDefinitionSnapshots } from './published-tag-snapshot';
import type { ClubTagDefinition } from 'app/club-tenant/model/club-tag';

describe('buildTagDefinitionSnapshot', () => {
  const defs: ClubTagDefinition[] = [
    { id: 'gold', label: 'Gold' },
    { id: 'silver', label: 'Silver' },
    { id: 'u16', label: 'Under 16' },
    { id: 'youth', label: 'Youth' },
  ];

  it('returns [] when no ids are referenced', () => {
    expect(buildTagDefinitionSnapshot([], defs)).toEqual([]);
  });

  it('keeps only definitions whose id appears in referencedIds', () => {
    const out = buildTagDefinitionSnapshot(['u16'], defs);
    expect(out).toEqual([{ id: 'u16', label: 'Under 16' }]);
  });

  it('preserves the original order of definitions, not the input order', () => {
    const out = buildTagDefinitionSnapshot(['silver', 'gold'], defs);
    expect(out.map(d => d.id)).toEqual(['gold', 'silver']);
  });

  it('drops ids that have no matching definition (stale ids on results)', () => {
    const out = buildTagDefinitionSnapshot(['gold', 'deleted'], defs);
    expect(out.map(d => d.id)).toEqual(['gold']);
  });

  it('de-duplicates referencedIds', () => {
    const out = buildTagDefinitionSnapshot(['gold', 'gold', 'silver'], defs);
    expect(out.map(d => d.id)).toEqual(['gold', 'silver']);
  });

  it('canonicalizes legacy Youth alias to youth definition', () => {
    const out = buildTagDefinitionSnapshot(['Youth', 'youth'], defs);
    expect(out.map(d => d.id)).toEqual(['youth']);
  });
});

describe('mergeTagDefinitionSnapshots', () => {
  it('unions definitions by id without duplicates', () => {
    const raceDefs = [{ id: 'gold', label: 'Gold', color: 'gold' as const }];
    const seriesDefs = [
      { id: 'gold', label: 'Gold Fleet', color: 'gold' as const },
      { id: 'youth', label: 'Youth' },
    ];
    const out = mergeTagDefinitionSnapshots(raceDefs, seriesDefs);
    expect(out.map(d => d.id).sort()).toEqual(['gold', 'youth']);
    expect(out.find(d => d.id === 'gold')?.label).toBe('Gold');
  });
});
