import { describe, expect, it } from 'vitest';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { mergeKeyFor } from './merge-key';

function entry(over: Partial<SeriesEntry> & Pick<SeriesEntry, 'id'>): SeriesEntry {
  return {
    seriesId: 'series-1',
    helm: 'Sam Skipper',
    boatClass: 'ILCA 7',
    sailNumber: 12345,
    handicaps: [],
    ...over,
  };
}

describe('mergeKeyFor', () => {
  describe("strategy 'classSailNumberHelm'", () => {
    it('uses the SeriesEntry id so each per-hull entry stays its own competitor', () => {
      const a = entry({ id: 'e1' });
      const b = entry({ id: 'e2', helm: 'Sam Skipper' });

      expect(mergeKeyFor(a, 'classSailNumberHelm')).toBe('e1');
      expect(mergeKeyFor(b, 'classSailNumberHelm')).toBe('e2');
      expect(mergeKeyFor(a, 'classSailNumberHelm')).not.toBe(mergeKeyFor(b, 'classSailNumberHelm'));
    });
  });

  describe("strategy 'regatta'", () => {
    it('also uses the SeriesEntry id (no merge)', () => {
      const a = entry({ id: 'e1' });
      expect(mergeKeyFor(a, 'regatta')).toBe('e1');
    });
  });

  describe("strategy 'classSailNumber'", () => {
    it('groups distinct entries that share a hull (class + sail number) regardless of helm', () => {
      const sharedHullA = entry({ id: 'e1', helm: 'Helm One', boatClass: 'ILCA 7', sailNumber: 12345 });
      const sharedHullB = entry({ id: 'e2', helm: 'Helm Two', boatClass: 'ILCA 7', sailNumber: 12345 });
      const otherHull = entry({ id: 'e3', helm: 'Helm Two', boatClass: 'ILCA 7', sailNumber: 99999 });

      expect(mergeKeyFor(sharedHullA, 'classSailNumber'))
        .toBe(mergeKeyFor(sharedHullB, 'classSailNumber'));
      expect(mergeKeyFor(sharedHullA, 'classSailNumber'))
        .not.toBe(mergeKeyFor(otherHull, 'classSailNumber'));
    });

    it('normalises class case / surrounding whitespace', () => {
      const a = entry({ id: 'e1', boatClass: 'ILCA 7', sailNumber: 1 });
      const b = entry({ id: 'e2', boatClass: '  ilca 7 ', sailNumber: 1 });
      expect(mergeKeyFor(a, 'classSailNumber')).toBe(mergeKeyFor(b, 'classSailNumber'));
    });
  });

  describe("strategy 'helm'", () => {
    it('groups all entries sailed by the same helm regardless of hull', () => {
      const lasers = entry({ id: 'e1', helm: 'Sam Skipper', boatClass: 'ILCA 7', sailNumber: 100 });
      const aero = entry({ id: 'e2', helm: 'Sam Skipper', boatClass: 'RS Aero 7', sailNumber: 200 });
      const someone = entry({ id: 'e3', helm: 'Other Person', boatClass: 'RS Aero 7', sailNumber: 200 });

      expect(mergeKeyFor(lasers, 'helm')).toBe(mergeKeyFor(aero, 'helm'));
      expect(mergeKeyFor(lasers, 'helm')).not.toBe(mergeKeyFor(someone, 'helm'));
    });

    it('normalises helm case / surrounding whitespace', () => {
      const a = entry({ id: 'e1', helm: 'Sam Skipper' });
      const b = entry({ id: 'e2', helm: '  sam SKIPPER ' });
      expect(mergeKeyFor(a, 'helm')).toBe(mergeKeyFor(b, 'helm'));
    });

    it('treats missing/empty helm as a single bucket (callers must screen these)', () => {
      const a = entry({ id: 'e1', helm: '' });
      const b = entry({ id: 'e2', helm: '   ' });
      expect(mergeKeyFor(a, 'helm')).toBe(mergeKeyFor(b, 'helm'));
    });
  });
});
