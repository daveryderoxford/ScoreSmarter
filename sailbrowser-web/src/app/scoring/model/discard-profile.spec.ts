import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LONG_DISCARDS,
  DEFAULT_SHORT_DISCARDS,
  defaultDiscardsForNewSeries,
  discardsForRaceIndex,
  formatDiscardScheduleSummary,
  generateDiscardArray,
  validateDiscardRaceSequence,
} from './discard-profile';

describe('discard-profile', () => {
  describe('default schedules', () => {
    it('uses one discard at each odd race from 3 through 101 for long series', () => {
      expect(DEFAULT_LONG_DISCARDS[0]).toBe(3);
      expect(DEFAULT_LONG_DISCARDS.at(-1)).toBe(101);
      expect(DEFAULT_LONG_DISCARDS).toEqual(
        Array.from({ length: 50 }, (_, index) => 3 + index * 2),
      );
    });

    it('uses a single discard after 3 races for short series', () => {
      expect(DEFAULT_SHORT_DISCARDS).toEqual([3]);
    });

    it('uses the club long or short profile when creating a series', () => {
      const club = {
        longSeriesDefaults: { discards: [4, 8] },
        shortSeriesDefaults: { discards: [3, 6] },
      };
      expect(defaultDiscardsForNewSeries('long', club)).toEqual([4, 8]);
      expect(defaultDiscardsForNewSeries('short', club)).toEqual([3, 6]);
    });

    it('keeps an explicit empty club profile', () => {
      expect(defaultDiscardsForNewSeries('short', {
        shortSeriesDefaults: { discards: [] },
      })).toEqual([]);
    });

    it('falls back to app defaults when the club profile is missing', () => {
      expect(defaultDiscardsForNewSeries('long', {})).toEqual([...DEFAULT_LONG_DISCARDS]);
      expect(defaultDiscardsForNewSeries('short')).toEqual([3]);
    });
  });

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
