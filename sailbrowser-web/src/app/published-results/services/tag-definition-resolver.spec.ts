import { describe, expect, it } from 'vitest';
import { findTagDefinition, normalizeTagIds, resolveTags } from './resolved-tag';
import { CLUB_TAG_COLORS, type ClubTagDefinition } from 'app/club-tenant/model/club-tag';

describe('findTagDefinition', () => {
  const defs: ClubTagDefinition[] = [
    { id: 'youth', label: 'Youth' },
    { id: 'gold', label: 'Gold Fleet', color: 'gold' },
  ];

  it('matches exact id', () => {
    expect(findTagDefinition('youth', defs)?.id).toBe('youth');
  });

  it('matches id case-insensitively', () => {
    expect(findTagDefinition('Youth', defs)?.id).toBe('youth');
  });

  it('matches unique label for legacy stored values', () => {
    expect(findTagDefinition('Youth', defs)?.id).toBe('youth');
  });
});

describe('normalizeTagIds', () => {
  const defs: ClubTagDefinition[] = [
    { id: 'youth', label: 'Youth' },
    { id: 'gold', label: 'Gold Fleet', color: 'gold' },
  ];

  it('dedupes Youth and youth to canonical youth', () => {
    expect(normalizeTagIds(['Youth', 'youth', 'gold'], defs)).toEqual(['youth', 'gold']);
  });
});

describe('resolveTags', () => {
  const defs: ClubTagDefinition[] = [
    { id: 'gold', label: 'Gold Fleet', color: 'gold' },
    { id: 'u16', label: 'Under 16' },
    { id: 'youth', label: 'Youth' },
    { id: 'hidden', label: '', color: 'blue' },
  ];

  it('returns [] for empty input', () => {
    expect(resolveTags([], defs)).toEqual([]);
  });

  it('resolves known ids to label / colour', () => {
    const out = resolveTags(['gold'], defs);
    expect(out).toEqual([
      {
        id: 'gold',
        label: 'Gold Fleet',
        color: CLUB_TAG_COLORS.gold,
        unresolved: false,
      },
    ]);
  });

  it('falls back to default-styled chip (unresolved = true) when no definition matches', () => {
    const out = resolveTags(['novice'], defs);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'novice',
      label: 'novice',
      unresolved: true,
    });
    expect(out[0].color).toBeUndefined();
  });

  it('treats blank-label definitions as unresolved (hidden via admin)', () => {
    const out = resolveTags(['hidden'], defs);
    expect(out).toHaveLength(1);
    expect(out[0].unresolved).toBe(true);
    expect(out[0].label).toBe('hidden');
    expect(out[0].color).toBeUndefined();
  });

  it('dedupes Youth + youth aliases to one resolved youth tag', () => {
    const out = resolveTags(['Youth', 'youth', 'gold'], defs);
    expect(out.map(r => r.id)).toEqual(['youth', 'gold']);
    expect(out[0].unresolved).toBe(false);
    expect(out[0].label).toBe('Youth');
    expect(out[0].color).toBeUndefined();
    expect(out[1].unresolved).toBe(false);
  });

  it('preserves input order across resolved + unresolved tags', () => {
    const out = resolveTags(['novice', 'gold', 'u16'], defs);
    expect(out.map(r => r.id)).toEqual(['novice', 'gold', 'u16']);
    expect(out[0].unresolved).toBe(true);
    expect(out[1].unresolved).toBe(false);
    expect(out[2].unresolved).toBe(false);
  });

  it('omits a definition with missing colour from the output style', () => {
    const out = resolveTags(['u16'], defs);
    expect(out[0].color).toBeUndefined();
  });
});
