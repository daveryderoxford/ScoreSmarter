import { describe, expect, it } from 'vitest';
import { catalogClassPrefill, nextNegativeCatalogueId, suggestCatalogClass, type CatalogClass } from './catalog-class';
import { cleanRyaClassName, mergeRyaClassList, parseRyaClassList } from './rya-class-list';

const RYA_CSV = [
  'RYA PN LIST - Dinghy,,,,,,,',
  'Portsmouth Number List 2026,,,,,,,',
  'RYA Class ID,Class Name,No. of Crew,Rig,Spinnaker,Number,Change,Notes',
  '191,ILCA 7 / Laser,1,U,0,1103,-1,',
  '22,ALBACORE,2,S,0,1037,0,',
  '303,RS200,2,S,A,1053,3,',
  '254,"MIRROR -SINGLEHANDED WITH SPINNAKER",1,S,C,1364,4,MOVED FROM LIMITED DATA LIST',
  ',Following a review of the formulas,,,,,,',
].join('\n');

describe('parseRyaClassList', () => {
  it('skips title rows and note rows and reads each class', () => {
    const { rows, errors } = parseRyaClassList(RYA_CSV);

    expect(errors).toEqual([]);
    expect(rows.map(r => r.ryaClassId)).toEqual([191, 22, 303, 254]);
    expect(rows[0]).toEqual({ ryaClassId: 191, name: 'ILCA 7 / Laser', crew: 1, rig: 'U', spinnaker: '0', pn: 1103, notes: undefined });
    expect(rows[3].notes).toBe('MOVED FROM LIMITED DATA LIST');
  });

  it('reports a file without an RYA Class ID column', () => {
    expect(parseRyaClassList('Name,PN\nFoo,1000').errors).toHaveLength(1);
  });

  it('reads PN columns headed with a year', () => {
    for (const header of ['PN 2026', '2026 Number', 'RYA PN', 'Portsmouth Number']) {
      const { rows, errors } = parseRyaClassList(`RYA Class ID,Class Name,${header}\n303,RS200,1053`);
      expect(errors, header).toEqual([]);
      expect(rows[0].pn, header).toBe(1053);
    }
  });

  it('warns when there is no PN column or it has no PNs', () => {
    expect(parseRyaClassList('RYA Class ID,Class Name,Crew\n303,RS200,2').errors[0]).toMatch(/No PN column/);
    expect(parseRyaClassList('RYA Class ID,Class Name,PN\n303,RS200,').errors[0]).toMatch(/has no PNs/);
  });
});

describe('cleanRyaClassName', () => {
  it('title-cases all-caps names but keeps acronyms and numbers', () => {
    expect(cleanRyaClassName('ALBACORE')).toBe('Albacore');
    expect(cleanRyaClassName('RS AERO 5')).toBe('RS Aero 5');
    expect(cleanRyaClassName('GP14')).toBe('GP14');
    expect(cleanRyaClassName('ILCA 7 / Laser')).toBe('ILCA 7 / Laser');
  });
});

describe('mergeRyaClassList', () => {
  const existing: CatalogClass[] = [
    { catalogueId: 191, name: 'ILCA 7', crew: 1, rig: 'U', spinnaker: '0', rya: { name: 'ILCA 7 / Laser', pn: 1100 }, aliases: ['Laser'] },
    { catalogueId: 999, name: 'Retired class', crew: 2, rya: { name: 'RETIRED' } },
    { catalogueId: -1, name: 'Local Dory', crew: 2 },
  ];

  it('updates RYA details by id, keeping the ScoreSmarter name and aliases', () => {
    const { rows } = parseRyaClassList(RYA_CSV);
    const result = mergeRyaClassList(existing, rows);
    const ilca = result.classes.find(c => c.catalogueId === 191)!;

    expect(ilca.name).toBe('ILCA 7');
    expect(ilca.aliases).toEqual(['Laser']);
    expect(ilca.rya?.pn).toBe(1103);
    expect(result.updated).toBe(1);
    expect(result.added).toBe(3);
  });

  it('adds new RYA classes with a cleaned name and keeps non-RYA and delisted entries', () => {
    const { rows } = parseRyaClassList(RYA_CSV);
    const result = mergeRyaClassList(existing, rows);

    expect(result.classes.find(c => c.catalogueId === 22)?.name).toBe('Albacore');
    expect(result.classes.some(c => c.catalogueId === -1)).toBe(true);
    expect(result.notInList.map(c => c.catalogueId)).toEqual([999]);
  });

  it('counts an identical re-import as unchanged', () => {
    const { rows } = parseRyaClassList(RYA_CSV);
    const first = mergeRyaClassList([], rows).classes;
    const second = mergeRyaClassList(first, rows);

    expect(second).toMatchObject({ added: 0, updated: 0, unchanged: 4 });
  });
});

describe('catalogue helpers', () => {
  const classes: CatalogClass[] = [
    { catalogueId: 191, name: 'ILCA 7', crew: 1, rya: { name: 'ILCA 7 / Laser' }, aliases: ['Laser'] },
    { catalogueId: -1, name: 'Local Dory', crew: 2 },
    { catalogueId: -4, name: 'Other', crew: 1 },
  ];

  it('allocates the next negative id below the lowest, never reusing ids', () => {
    expect(nextNegativeCatalogueId(classes)).toBe(-5);
    expect(nextNegativeCatalogueId([])).toBe(-1);
  });

  it('pre-fills a new club class with the clean name, single-hander flag and RYA PN', () => {
    const ilca: CatalogClass = { catalogueId: 191, name: 'ILCA 7', crew: 1, rya: { name: 'ILCA 7 / Laser', pn: 1103 } };
    const dory: CatalogClass = { catalogueId: -1, name: 'Local Dory', crew: 2 };

    expect(catalogClassPrefill(ilca)).toEqual({ catalogueId: 191, name: 'ILCA 7', isSinglehander: true, pyHandicap: 1103 });
    expect(catalogClassPrefill(dory)).toEqual({ catalogueId: -1, name: 'Local Dory', isSinglehander: false });
  });

  it('suggests an entry by name, RYA name or alias ignoring case and punctuation', () => {
    expect(suggestCatalogClass('ilca-7', classes)?.catalogueId).toBe(191);
    expect(suggestCatalogClass('ILCA 7 / LASER', classes)?.catalogueId).toBe(191);
    expect(suggestCatalogClass('laser', classes)?.catalogueId).toBe(191);
    expect(suggestCatalogClass('Unknown', classes)).toBeUndefined();
  });
});
