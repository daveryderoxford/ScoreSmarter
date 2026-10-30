import { describe, expect, it } from 'vitest';
import type { BoatClass } from './boat-class';
import type { CatalogClass } from './catalog-class';
import {
  classKind,
  classRating,
  isSchemeOverridden,
  localClassId,
  newClubClass,
  ryaClassId,
  ryaClubClass,
  ryaConfigurationLabel,
} from './club-class';
import type { RatingList } from './rating-list';

const ilca7: CatalogClass = { catalogueId: 191, name: 'ILCA 7', crew: 1, rig: 'U', spinnaker: '0', rya: { name: 'ILCA 7 / Laser' } };
const rs200: CatalogClass = { catalogueId: 303, name: 'RS200', crew: 2, rig: 'S', spinnaker: 'A', rya: { name: 'RS200' } };
const localDory: CatalogClass = { catalogueId: -1, name: 'Dory', crew: 2 };

const pyList = (name: string, from: string, ratings: Record<string, number>): RatingList => ({
  id: name, scheme: 'PY', issuer: 'RYA', name, effectiveFrom: new Date(from), ratings,
});
const lists = [
  pyList('PN 2026', '2026-03-01', { 191: 1100, 303: 1053 }),
  pyList('PN 2027', '2027-03-01', { 191: 1095 }),
];

describe('class ids and kinds', () => {
  it('builds RYA and local ids', () => {
    expect(ryaClassId(191)).toBe('rya-191');
    expect(localClassId(' Merlin Rocket (pre 2000) ')).toBe('local-merlin-rocket-pre-2000');
    expect(localClassId('!!')).toBe('local-class');
  });

  it('derives the kind of classes saved before kinds existed', () => {
    expect(classKind({ catalogueId: 191 })).toBe('rya');
    expect(classKind({ catalogueId: -3 })).toBe('local');
    expect(classKind({})).toBe('local');
    expect(classKind({ kind: 'local', catalogueId: 191 })).toBe('local');
  });
});

describe('isSchemeOverridden', () => {
  it('reads overriddenSchemes, falling back to the old pyOverridden flag', () => {
    expect(isSchemeOverridden({ overriddenSchemes: ['PY'] }, 'PY')).toBe(true);
    expect(isSchemeOverridden({ overriddenSchemes: [], pyOverridden: true }, 'PY')).toBe(false);
    expect(isSchemeOverridden({ pyOverridden: true }, 'PY')).toBe(true);
    expect(isSchemeOverridden({ pyOverridden: true }, 'IRC')).toBe(false);
    expect(isSchemeOverridden({}, 'PY')).toBe(false);
  });
});

describe('classRating', () => {
  const ilca: BoatClass = { id: 'rya-191', name: 'ILCA 7', kind: 'rya', catalogueId: 191, handicaps: [{ scheme: 'PY', value: 1110 }] };

  it('uses the list in force on the date for RYA classes', () => {
    expect(classRating(ilca, 'PY', lists, new Date('2026-10-01'))).toBe(1100);
    expect(classRating(ilca, 'PY', lists, new Date('2027-03-01'))).toBe(1095);
  });

  it('uses the club value before any list, when the list has no rating, when overridden and for local classes', () => {
    expect(classRating(ilca, 'PY', lists, new Date('2025-06-01'))).toBe(1110);
    expect(classRating({ ...ilca, catalogueId: 999 }, 'PY', lists, new Date('2026-10-01'))).toBe(1110);
    expect(classRating({ ...ilca, overriddenSchemes: ['PY'] }, 'PY', lists, new Date('2026-10-01'))).toBe(1110);
    expect(classRating({ ...ilca, kind: 'local' }, 'PY', lists, new Date('2026-10-01'))).toBe(1110);
    expect(classRating(ilca, 'Level Rating', lists, new Date('2026-10-01'))).toBeUndefined();
  });
});

describe('ryaConfigurationLabel', () => {
  it('describes crew and spinnaker', () => {
    expect(ryaConfigurationLabel(ilca7)).toBe('Single-handed');
    expect(ryaConfigurationLabel(rs200)).toBe('2 crew, asymmetric spinnaker');
    expect(ryaConfigurationLabel({ crew: 2, spinnaker: 'C' })).toBe('2 crew, spinnaker');
  });
});

describe('ryaClubClass', () => {
  it('takes id, name, single-hander and PY from the RYA entry and PN', () => {
    expect(ryaClubClass(ilca7, [{ scheme: 'PY', value: 1000 }, { scheme: 'Level Rating', value: 1 }], 1100)).toEqual({
      id: 'rya-191',
      name: 'ILCA 7',
      kind: 'rya',
      catalogueId: 191,
      isSinglehander: true,
      handicaps: [{ scheme: 'PY', value: 1100 }, { scheme: 'Level Rating', value: 1 }],
      overriddenSchemes: [],
    });
  });

  it('marks a PY that differs from the RYA PN as overridden', () => {
    const c = ryaClubClass(rs200, [], 1053, 1040);
    expect(c.handicaps).toEqual([{ scheme: 'PY', value: 1040 }]);
    expect(c.overriddenSchemes).toEqual(['PY']);
    expect(ryaClubClass(rs200, [], 1053, 1053).overriddenSchemes).toEqual([]);
  });

  it('keeps a PY given when there is no PN, without overriding', () => {
    expect(ryaClubClass(rs200, [], undefined, 1050)).toMatchObject({ handicaps: [{ scheme: 'PY', value: 1050 }], overriddenSchemes: [] });
    expect(ryaClubClass(rs200, [], undefined).handicaps).toEqual([]);
  });

  it('refuses non-RYA catalogue entries', () => {
    expect(() => ryaClubClass(localDory, [], undefined)).toThrow(/not an RYA class/);
  });
});

describe('newClubClass', () => {
  const catalogue = [ilca7, rs200, localDory];
  const existing: BoatClass[] = [
    { id: 'rya-379', name: 'Topper', kind: 'rya', catalogueId: 379, handicaps: [] },
    { id: 'local-punt', name: 'Punt', kind: 'local', handicaps: [] },
  ];
  const current = [pyList('PN 2026', '2026-03-01', { 191: 1100 })];

  it('builds an RYA class with the current PN unless a PY is given', () => {
    expect(newClubClass({ kind: 'rya', catalogueId: 191, handicaps: [] }, existing, catalogue, current)).toEqual({
      id: 'rya-191', name: 'ILCA 7', kind: 'rya', catalogueId: 191, isSinglehander: true,
      handicaps: [{ scheme: 'PY', value: 1100 }], overriddenSchemes: [],
    });
    const overridden = newClubClass({ kind: 'rya', catalogueId: 191, handicaps: [{ scheme: 'PY', value: 1090 }] }, existing, catalogue, current);
    expect(overridden).toMatchObject({ handicaps: [{ scheme: 'PY', value: 1090 }], overriddenSchemes: ['PY'] });
  });

  it('refuses unknown, local-catalogue and duplicate RYA classes', () => {
    expect(newClubClass({ kind: 'rya', catalogueId: 999, handicaps: [] }, existing, catalogue, current)).toMatch(/not in the RYA list/);
    expect(newClubClass({ kind: 'rya', catalogueId: -1, handicaps: [] }, existing, catalogue, current)).toMatch(/not in the RYA list/);
    const withIlca = [...existing, { id: 'ILCA 7', name: 'ILCA 7', catalogueId: 191, handicaps: [] }];
    expect(newClubClass({ kind: 'rya', catalogueId: 191, handicaps: [] }, withIlca, catalogue, current)).toMatch(/already/);
  });

  it('builds local classes with unique ids', () => {
    expect(newClubClass({ kind: 'local', name: '  Dory  Junior ', isSinglehander: true, handicaps: [] }, existing, catalogue, current))
      .toEqual({ id: 'local-dory-junior', name: 'Dory Junior', kind: 'local', isSinglehander: true, handicaps: [] });
    const clash = [...existing, { id: 'local-dory', name: 'Other', handicaps: [] }];
    expect(newClubClass({ kind: 'local', name: 'Dory!', handicaps: [] }, clash, catalogue, current)).toMatchObject({ id: 'local-dory-2' });
  });

  it('refuses local classes clashing with club or RYA names', () => {
    expect(newClubClass({ kind: 'local', name: 'topper', handicaps: [] }, existing, catalogue, current)).toMatch(/already has/);
    expect(newClubClass({ kind: 'local', name: 'ilca 7', handicaps: [] }, existing, catalogue, current)).toMatch(/RYA list/);
    expect(newClubClass({ kind: 'local', name: '  ', handicaps: [] }, existing, catalogue, current)).toMatch(/Enter/);
  });
});
