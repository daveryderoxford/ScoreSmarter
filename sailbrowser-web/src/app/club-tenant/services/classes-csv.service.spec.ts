import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BoatClass } from '../model/boat-class';
import type { CatalogClass } from '../model/catalog-class';
import { ClassesCsvService } from './classes-csv.service';

const ilca7: CatalogClass = { catalogueId: 191, name: 'ILCA 7', crew: 1, rya: { name: 'ILCA 7 / LASER', pn: 1100 } };
const rs200: CatalogClass = { catalogueId: 303, name: 'RS200', crew: 2, rya: { name: 'RS200', pn: 1053 } };
const catalogue = new Map([[191, ilca7], [303, rs200]]);

const rows = (service: ClassesCsvService, csv: string, schemes = ['PY'] as const) =>
  service.parseCsv(csv, [...schemes], catalogue);

describe('ClassesCsvService', () => {
  let service: ClassesCsvService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClassesCsvService);
  });

  it('round-trips RYA and local classes', () => {
    const classes: BoatClass[] = [
      { id: 'rya-191', name: 'ILCA 7', kind: 'rya', catalogueId: 191, isSinglehander: true, pyOverridden: true,
        handicaps: [{ scheme: 'PY', value: 1090 }] },
      { id: 'local-dory', name: 'Dory', kind: 'local', isSinglehander: false, handicaps: [{ scheme: 'PY', value: 1300 }] },
    ];

    const parsed = rows(service, service.buildCsv(classes, ['PY']));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map(r => r.boatClass)).toEqual(classes);
  });

  it('builds RYA rows from the RYA list, using the RYA PN unless overridden', () => {
    const parsed = rows(service, 'name,catalogueId,handicapPY\nRS200,303,\nILCA 7,191,1090\n');

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].boatClass).toMatchObject({ id: 'rya-303', kind: 'rya', handicaps: [{ scheme: 'PY', value: 1053 }], pyOverridden: false });
    expect(parsed.rows[1].boatClass).toMatchObject({ id: 'rya-191', isSinglehander: true, handicaps: [{ scheme: 'PY', value: 1090 }], pyOverridden: true });
  });

  it('rejects RYA rows not in the RYA list or with a different name', () => {
    const parsed = rows(service, 'name,kind,catalogueId,handicapPY\nLaser,rya,191,1100\nFoo,rya,999,1000\nBar,rya,,1000\n');

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual([
      'Line 2: the RYA class 191 is called ILCA 7',
      'Line 3: RYA Class ID 999 is not in the RYA list',
      'Line 4: an RYA class needs its catalogueId',
    ]);
  });

  it('reads local rows, defaulting isSinglehander to false', () => {
    const parsed = rows(service, 'name,isSinglehander,handicapPY\nDory,,1300\nPunt,yes,1400\n');

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map(r => r.boatClass)).toEqual([
      { id: 'local-dory', name: 'Dory', kind: 'local', isSinglehander: false, handicaps: [{ scheme: 'PY', value: 1300 }] },
      { id: 'local-punt', name: 'Punt', kind: 'local', isSinglehander: true, handicaps: [{ scheme: 'PY', value: 1400 }] },
    ]);
  });

  it('rejects duplicate rows', () => {
    const parsed = rows(service, 'name,handicapPY\nDory,1300\ndory,1301\n');
    expect(parsed.errors).toEqual(['Line 3: dory appears more than once']);
  });

  it('rejects CSV missing handicap columns for supported schemes', () => {
    const parsed = service.parseCsv('id,name\nILCA 7,ILCA 7\n', ['PY', 'Level Rating'], catalogue);

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual(['Missing required columns: handicapPY, handicapLevelRating']);
  });

  describe('merge', () => {
    const club: BoatClass[] = [
      { id: 'rya-191', name: 'ILCA 7', kind: 'rya', catalogueId: 191, isSinglehander: true, handicaps: [{ scheme: 'PY', value: 1100 }] },
      { id: 'local-dory', name: 'Dory', kind: 'local', handicaps: [{ scheme: 'PY', value: 1300 }] },
    ];

    it('updates by id or name, adds new classes and keeps classes not in the file', () => {
      const parsed = rows(service, 'id,name,handicapPY\nlocal-dory,Dory,1310\n,ILCA 7,1095\n,Punt,1400\n');
      const merged = service.merge(club, parsed.rows);

      expect(merged.errors).toEqual([]);
      expect(merged).toMatchObject({ added: 1, updated: 2 });
      expect(merged.classes.map(c => [c.id, c.handicaps[0].value])).toEqual([
        ['rya-191', 1095],
        ['local-dory', 1310],
        ['local-punt', 1400],
      ]);
      expect(merged.classes[0]).toMatchObject({ kind: 'rya', catalogueId: 191, isSinglehander: true });
    });

    it('turns a local class into the RYA class with its name', () => {
      const local: BoatClass[] = [{ id: 'RS200', name: 'RS200', handicaps: [], formerNames: ['RS 200'] }];
      const merged = service.merge(local, rows(service, 'name,catalogueId,handicapPY\nRS200,303,\n').rows);

      expect(merged.classes).toEqual([
        expect.objectContaining({ id: 'rya-303', kind: 'rya', formerNames: ['RS 200'] }),
      ]);
    });

    it('refuses renames', () => {
      const merged = service.merge(club, rows(service, 'id,name,handicapPY\nlocal-dory,Big Dory,1300\n').rows);
      expect(merged.errors).toEqual(['Line 2: id local-dory is Dory; rename classes on the Classes page']);
    });
  });
});
