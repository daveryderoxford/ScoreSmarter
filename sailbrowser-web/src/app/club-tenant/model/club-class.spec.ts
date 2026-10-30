import { describe, expect, it } from 'vitest';
import type { BoatClass } from './boat-class';
import type { CatalogClass } from './catalog-class';
import {
  applyRyaPyUpdates,
  classKind,
  localClassId,
  newClubClass,
  ryaClassId,
  ryaClubClass,
  ryaConfigurationLabel,
  ryaPyUpdatePlan,
} from './club-class';

const ilca7: CatalogClass = { catalogueId: 191, name: 'ILCA 7', crew: 1, rig: 'U', spinnaker: '0', rya: { name: 'ILCA 7 / Laser', pn: 1100 } };
const rs200: CatalogClass = { catalogueId: 303, name: 'RS200', crew: 2, rig: 'S', spinnaker: 'A', rya: { name: 'RS200', pn: 1053 } };
const localDory: CatalogClass = { catalogueId: -1, name: 'Dory', crew: 2 };

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

describe('ryaConfigurationLabel', () => {
  it('describes crew and spinnaker', () => {
    expect(ryaConfigurationLabel(ilca7)).toBe('Single-handed');
    expect(ryaConfigurationLabel(rs200)).toBe('2 crew, asymmetric spinnaker');
    expect(ryaConfigurationLabel({ crew: 2, spinnaker: 'C' })).toBe('2 crew, spinnaker');
  });
});

describe('ryaClubClass', () => {
  it('takes id, name, single-hander and PY from the RYA entry', () => {
    expect(ryaClubClass(ilca7, [{ scheme: 'PY', value: 1000 }, { scheme: 'Level Rating', value: 1 }])).toEqual({
      id: 'rya-191',
      name: 'ILCA 7',
      kind: 'rya',
      catalogueId: 191,
      isSinglehander: true,
      handicaps: [{ scheme: 'PY', value: 1100 }, { scheme: 'Level Rating', value: 1 }],
      pyOverridden: false,
    });
  });

  it('marks a PY that differs from the RYA PN as overridden', () => {
    const c = ryaClubClass(rs200, [], 1040);
    expect(c.handicaps).toEqual([{ scheme: 'PY', value: 1040 }]);
    expect(c.pyOverridden).toBe(true);
    expect(ryaClubClass(rs200, [], 1053).pyOverridden).toBe(false);
  });

  it('treats a null catalogue PN as missing', () => {
    const noPn = { ...rs200, rya: { name: 'RS200', pn: null as unknown as number } };
    expect(ryaClubClass(noPn, [{ scheme: 'PY', value: 1050 }]).handicaps).toEqual([]);
    expect(ryaPyUpdatePlan([ryaClubClass(rs200, [])], new Map([[303, noPn]]))).toEqual({ updates: [], overridden: [] });
  });

  it('refuses non-RYA catalogue entries', () => {
    expect(() => ryaClubClass(localDory, [])).toThrow(/not an RYA class/);
  });
});

describe('ryaPyUpdatePlan', () => {
  const catalogue = new Map([[191, { ...ilca7, rya: { name: 'ILCA 7 / Laser', pn: 1095 } }], [303, rs200]]);
  const classes: BoatClass[] = [
    { id: 'rya-191', name: 'ILCA 7', kind: 'rya', catalogueId: 191, handicaps: [{ scheme: 'PY', value: 1100 }] },
    { id: 'rya-303', name: 'RS200', kind: 'rya', catalogueId: 303, pyOverridden: true, handicaps: [{ scheme: 'PY', value: 1040 }] },
    { id: 'local-dory', name: 'Dory', kind: 'local', handicaps: [{ scheme: 'PY', value: 1200 }] },
  ];

  it('updates RYA classes to the new PN and lists overridden ones separately', () => {
    const plan = ryaPyUpdatePlan(classes, catalogue);
    expect(plan.updates.map(u => [u.boatClass.id, u.current, u.rya])).toEqual([['rya-191', 1100, 1095]]);
    expect(plan.overridden.map(u => [u.boatClass.id, u.current, u.rya])).toEqual([['rya-303', 1040, 1053]]);
  });

  it('applies only the updates', () => {
    const updated = applyRyaPyUpdates(classes, ryaPyUpdatePlan(classes, catalogue));
    expect(updated[0].handicaps).toEqual([{ scheme: 'PY', value: 1095 }]);
    expect(updated[1]).toBe(classes[1]);
    expect(updated[2]).toBe(classes[2]);
  });
});

describe('newClubClass', () => {
  const catalogue = [ilca7, rs200, localDory];
  const existing: BoatClass[] = [
    { id: 'rya-379', name: 'Topper', kind: 'rya', catalogueId: 379, handicaps: [] },
    { id: 'local-punt', name: 'Punt', kind: 'local', handicaps: [] },
  ];

  it('builds an RYA class from the catalogue, with the RYA PN unless a PY is given', () => {
    expect(newClubClass({ kind: 'rya', catalogueId: 191, handicaps: [] }, existing, catalogue)).toEqual({
      id: 'rya-191', name: 'ILCA 7', kind: 'rya', catalogueId: 191, isSinglehander: true,
      handicaps: [{ scheme: 'PY', value: 1100 }], pyOverridden: false,
    });
    const overridden = newClubClass({ kind: 'rya', catalogueId: 191, handicaps: [{ scheme: 'PY', value: 1090 }] }, existing, catalogue);
    expect(overridden).toMatchObject({ handicaps: [{ scheme: 'PY', value: 1090 }], pyOverridden: true });
  });

  it('refuses unknown, local-catalogue and duplicate RYA classes', () => {
    expect(newClubClass({ kind: 'rya', catalogueId: 999, handicaps: [] }, existing, catalogue)).toMatch(/not in the RYA list/);
    expect(newClubClass({ kind: 'rya', catalogueId: -1, handicaps: [] }, existing, catalogue)).toMatch(/not in the RYA list/);
    const withIlca = [...existing, { id: 'ILCA 7', name: 'ILCA 7', catalogueId: 191, handicaps: [] }];
    expect(newClubClass({ kind: 'rya', catalogueId: 191, handicaps: [] }, withIlca, catalogue)).toMatch(/already/);
  });

  it('builds local classes with unique ids', () => {
    expect(newClubClass({ kind: 'local', name: '  Dory  Junior ', isSinglehander: true, handicaps: [] }, existing, catalogue))
      .toEqual({ id: 'local-dory-junior', name: 'Dory Junior', kind: 'local', isSinglehander: true, handicaps: [] });
    const clash = [...existing, { id: 'local-dory', name: 'Other', handicaps: [] }];
    expect(newClubClass({ kind: 'local', name: 'Dory!', handicaps: [] }, clash, catalogue)).toMatchObject({ id: 'local-dory-2' });
  });

  it('refuses local classes clashing with club or RYA names', () => {
    expect(newClubClass({ kind: 'local', name: 'topper', handicaps: [] }, existing, catalogue)).toMatch(/already has/);
    expect(newClubClass({ kind: 'local', name: 'ilca 7', handicaps: [] }, existing, catalogue)).toMatch(/RYA list/);
    expect(newClubClass({ kind: 'local', name: '  ', handicaps: [] }, existing, catalogue)).toMatch(/Enter/);
  });
});
