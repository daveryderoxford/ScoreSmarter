import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BoatClass } from '../model/boat-class';
import { ClassesCsvService } from './classes-csv.service';

describe('ClassesCsvService', () => {
  let service: ClassesCsvService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClassesCsvService);
  });

  it('exports and imports isSinglehander', () => {
    const classes: BoatClass[] = [
      { id: 'ILCA 7', name: 'ILCA 7', handicaps: [{ scheme: 'PY', value: 1100 }], isSinglehander: true },
      { id: '420', name: '420', handicaps: [{ scheme: 'PY', value: 1110 }], isSinglehander: false },
    ];

    const csv = service.buildCsv(classes, ['PY']);
    const parsed = service.parseCsv(csv, ['PY']);

    expect(parsed.errors).toEqual([]);
    expect(parsed.classes).toHaveLength(2);
    expect(parsed.classes[0]?.isSinglehander).toBe(true);
    expect(parsed.classes[1]?.isSinglehander).toBe(false);
  });

  it('defaults isSinglehander to false when the column is missing', () => {
    const csv = 'id,name,handicapPY\nILCA 7,ILCA 7,1100\n';
    const parsed = service.parseCsv(csv, ['PY']);

    expect(parsed.errors).toEqual([]);
    expect(parsed.classes[0]?.isSinglehander).toBe(false);
  });

  it('accepts common truthy values for isSinglehander', () => {
    const csv = 'id,name,isSinglehander,handicapPY\nILCA 7,ILCA 7,1,1100\n';
    const parsed = service.parseCsv(csv, ['PY']);

    expect(parsed.errors).toEqual([]);
    expect(parsed.classes[0]?.isSinglehander).toBe(true);
  });
});
