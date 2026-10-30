import { describe, expect, it } from 'vitest';
import { nextNegativeCatalogueId, suggestCatalogClass, type CatalogClass } from './catalog-class';
import { cleanRyaClassName, mergeRyaClassList, parseRyaClassList, pyRatingsFromRyaList } from './rya-class-list';

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

});

describe('pyRatingsFromRyaList', () => {
  const catalogue: CatalogClass[] = [
    { catalogueId: 191, name: 'ILCA 7', crew: 1, rya: { name: 'ILCA 7 / Laser' } },
    { catalogueId: 303, name: 'RS200', crew: 2, rya: { name: 'RS200' } },
  ];

  it('keys PNs by catalogue id and lists RYA ids not in the catalogue', () => {
    const result = pyRatingsFromRyaList(parseRyaClassList(RYA_CSV), catalogue);
    expect(result.ratings).toEqual({ 191: 1103, 303: 1053 });
    expect(result.unknownIds).toEqual([22, 254]);
    expect(result.errors).toEqual([]);
  });

  it('reports a list without a PN column or without PNs', () => {
    const noColumn = parseRyaClassList('RYA Class ID,Class Name,Crew\n303,RS200,2');
    expect(pyRatingsFromRyaList(noColumn, catalogue).errors).toEqual(['No PN column was found.']);
    const empty = parseRyaClassList('RYA Class ID,Class Name,PN\n303,RS200,');
    expect(pyRatingsFromRyaList(empty, catalogue).errors).toEqual(['The PN column has no PNs.']);
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
    { catalogueId: 191, name: 'ILCA 7', crew: 1, rig: 'U', spinnaker: '0', rya: { name: 'ILCA 7 / Laser' }, aliases: ['Laser'] },
    { catalogueId: 303, name: 'RS200', crew: 1, rig: 'S', spinnaker: 'A', rya: { name: 'RS200' } },
    { catalogueId: 999, name: 'Retired class', crew: 2, rya: { name: 'RETIRED' } },
    { catalogueId: -1, name: 'Local Dory', crew: 2 },
  ];

  it('keeps published entries unchanged and reports rows that differ', () => {
    const result = mergeRyaClassList(existing, parseRyaClassList(RYA_CSV).rows);

    expect(result.classes.slice(0, 4)).toEqual(existing);
    expect(result.unchanged).toBe(1);
    expect(result.differences).toEqual([{ entry: existing[1], changes: ['crew 1 → 2'] }]);
  });

  it('adds new RYA classes with a cleaned name and lists delisted entries', () => {
    const result = mergeRyaClassList(existing, parseRyaClassList(RYA_CSV).rows);

    expect(result.added).toBe(2);
    expect(result.classes.find(c => c.catalogueId === 22)).toEqual({
      catalogueId: 22, name: 'Albacore', crew: 2, rig: 'S', spinnaker: '0', rya: { name: 'ALBACORE' },
    });
    expect(result.notInList.map(c => c.catalogueId)).toEqual([999]);
  });

  it('counts an identical re-import as unchanged', () => {
    const { rows } = parseRyaClassList(RYA_CSV);
    const second = mergeRyaClassList(mergeRyaClassList([], rows).classes, rows);

    expect(second).toMatchObject({ added: 0, unchanged: 4, differences: [] });
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

  it('suggests an entry by name, RYA name or alias ignoring case and punctuation', () => {
    expect(suggestCatalogClass('ilca-7', classes)?.catalogueId).toBe(191);
    expect(suggestCatalogClass('ILCA 7 / LASER', classes)?.catalogueId).toBe(191);
    expect(suggestCatalogClass('laser', classes)?.catalogueId).toBe(191);
    expect(suggestCatalogClass('Unknown', classes)).toBeUndefined();
  });
});
