import { describe, expect, it } from 'vitest';
import {
  compareSailNumbers,
  isValidSailNumber,
  normalizeSailNumber,
  sailNumberMatchesSearch,
  sailNumbersEqual,
} from './sail-number';

describe('sail-number', () => {
  describe('normalizeSailNumber', () => {
    it('coerces legacy Firestore numbers', () => {
      expect(normalizeSailNumber(12345)).toBe('12345');
      expect(normalizeSailNumber(123)).toBe('123');
    });

    it('trims whitespace and uppercases country code prefix', () => {
      expect(normalizeSailNumber('  gbr 12345  ')).toBe('GBR12345');
      expect(normalizeSailNumber('gbr')).toBe('GBR');
      expect(normalizeSailNumber('12345')).toBe('12345');
      expect(normalizeSailNumber('GBR12345A')).toBe('GBR12345A');
    });

    it('treats gbr and GBR as equal after normalize', () => {
      expect(sailNumbersEqual('gbr12345', 'GBR12345')).toBe(true);
    });

    it('returns empty for nullish', () => {
      expect(normalizeSailNumber(null)).toBe('');
      expect(normalizeSailNumber('')).toBe('');
    });
  });

  describe('sailNumbersEqual', () => {
    it('treats numeric and string forms as equal', () => {
      expect(sailNumbersEqual(12345, '12345')).toBe(true);
    });

    it('treats country-coded and bare numbers as different boats', () => {
      expect(sailNumbersEqual('GBR12345', '12345')).toBe(false);
    });
  });

  describe('compareSailNumbers', () => {
    it('sorts numerically within strings', () => {
      expect(compareSailNumbers('2', '10')).toBeLessThan(0);
      expect(compareSailNumbers('6789', '12345')).toBeLessThan(0);
    });

    it('orders GBR12345 and 12345 as distinct strings', () => {
      expect(compareSailNumbers('12345', 'GBR12345')).not.toBe(0);
    });
  });

  describe('isValidSailNumber', () => {
    it('requires a non-empty value after normalization', () => {
      expect(isValidSailNumber('12345')).toBe(true);
      expect(isValidSailNumber('GBR12345')).toBe(true);
      expect(isValidSailNumber('RED')).toBe(true);
      expect(isValidSailNumber('')).toBe(false);
      expect(isValidSailNumber('   ')).toBe(false);
    });
  });

  describe('sailNumberMatchesSearch', () => {
    it('matches suffix digits for partial entry', () => {
      expect(sailNumberMatchesSearch('12345', '345')).toBe(true);
      expect(sailNumberMatchesSearch('GBR12345', '345')).toBe(true);
    });
  });
});
