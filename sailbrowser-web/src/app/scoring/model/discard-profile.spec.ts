import { describe, expect, it } from 'vitest';
import {
  discardsForRaceIndex,
  formatDiscardScheduleSummary,
  generateDiscardArray,
  validateDiscardRaceSequence,
} from './discard-profile';

describe('discard-profile', () => {
  describe('generateDiscardArray', () => {
    it('counts triggers at or before each race', () => {
      expect(generateDiscardArray([4], 7)).toEqual([0, 0, 0, 1, 1, 1, 1]);
      expect(generateDiscardArray([3, 5], 5)).toEqual([0, 0, 1, 1, 2]);
    });

    it('sums duplicate triggers on one race (+2 jump)', () => {
      expect(generateDiscardArray([10, 10], 12)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2]);
    });

    it('four milestones with plateaus', () => {
      expect(generateDiscardArray([5, 5, 10, 10], 12)).toEqual([0, 0, 0, 0, 2, 2, 2, 2, 2, 4, 4, 4]);
    });

    it('empty triggers yields zeros', () => {
      expect(generateDiscardArray([], 5)).toEqual([0, 0, 0, 0, 0]);
    });
  });

  describe('discardAllowanceAfterRaceCount', () => {
    it('uses milestone list not dense ladder', () => {
      expect(discardsForRaceIndex({ discards: [4, 7] }, 5)).toBe(1);
      expect(discardsForRaceIndex({ discards: [4, 7] }, 7)).toBe(2);
    });

    it('no cap on race count for allowance lookup', () => {
      expect(discardsForRaceIndex({ discards: [4, 100, 200] }, 150)).toBe(2);
    });
  });

  describe('formatDiscardScheduleSummary', () => {
    it('lists milestone races', () => {
      expect(formatDiscardScheduleSummary([4, 7, 10])).toBe('Discards gained at races 4, 7, 10.');
    });

    it('empty triggers', () => {
      expect(formatDiscardScheduleSummary([])).toBe('No discards configured.');
    });
  });

  describe('validateDiscardTriggerRaceSequence', () => {
    it('allows non-decreasing duplicates', () => {
      expect(validateDiscardRaceSequence([10, 10])).toHaveLength(0);
    });

    it('allows large milestone race numbers', () => {
      expect(validateDiscardRaceSequence([400, 900])).toHaveLength(0);
    });

    it('flags out-of-order', () => {
      expect(validateDiscardRaceSequence([10, 5]).length).toBeGreaterThan(0);
    });
  });
});
