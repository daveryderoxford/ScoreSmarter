import { describe, expect, it } from 'vitest';
import { type BoatClass, isSinglehanderClass } from './boat-class';

const classes: BoatClass[] = [
  { id: 'ILCA 7', name: 'ILCA 7', handicaps: [], isSinglehander: true },
  { id: '420', name: '420', handicaps: [], isSinglehander: false },
  { id: 'GP14', name: 'GP14', handicaps: [] },
];

describe('isSinglehanderClass', () => {
  it('returns true when the class is marked single-hander', () => {
    expect(isSinglehanderClass('ILCA 7', classes)).toBe(true);
  });

  it('returns false when the class is explicitly double-handed', () => {
    expect(isSinglehanderClass('420', classes)).toBe(false);
  });

  it('returns false when isSinglehander is absent', () => {
    expect(isSinglehanderClass('GP14', classes)).toBe(false);
  });

  it('returns false for an unknown class name', () => {
    expect(isSinglehanderClass('Unknown', classes)).toBe(false);
  });
});
