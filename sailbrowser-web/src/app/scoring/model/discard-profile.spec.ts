import { describe, expect, it } from 'vitest';
import {
  DISCARD_PROFILE_CAP,
  discardAllowanceAfterRaceCount,
  discardLadderFromTriggerRaces,
  discardTableFromLegacy,
  formatDiscardScheduleSummary,
  padDiscardTableToLength,
  racesWhereDiscardAllowanceIncreases,
  triggerRacesFromDiscardLadder,
  validateDiscardTriggerRaceSequence,
  validateDiscardTable,
} from './discard-profile';

describe('discard-profile', () => {
  describe('discardTableFromLegacy', () => {
    it('matches historical engine ladder for initial=4, step=3', () => {
      const t = discardTableFromLegacy(4, 3, 10);
      expect(t[0]).toBe(0);
      expect(t[1]).toBe(0);
      expect(t[2]).toBe(0);
      expect(t[3]).toBe(1); // race 4
      expect(t[4]).toBe(1); // race 5
      expect(t[5]).toBe(1); // race 6
      expect(t[6]).toBe(2); // race 7
    });
  });

  describe('discardAllowanceAfterRaceCount', () => {
    it('reads explicit discards array', () => {
      const series = { discards: [0, 0, 1, 1, 2] };
      expect(discardAllowanceAfterRaceCount(series, 5)).toBe(2);
    });

    it('fills forward when explicit table is shorter than raceCount', () => {
      const series = { discards: [0, 0, 1] };
      expect(discardAllowanceAfterRaceCount(series, 5)).toBe(1);
    });

    it('reads from explicit ladder matching legacy (4 + every 3) at race 7', () => {
      const ladder = discardTableFromLegacy(4, 3, DISCARD_PROFILE_CAP);
      expect(discardAllowanceAfterRaceCount({ discards: ladder }, 7)).toBe(2);
    });
  });

  describe('racesWhereDiscardAllowanceIncreases / formatDiscardScheduleSummary', () => {
    it('lists races where allowance steps up', () => {
      const t = [0, 0, 1, 1, 2];
      expect(racesWhereDiscardAllowanceIncreases(t)).toEqual([3, 5]);
      expect(formatDiscardScheduleSummary(t)).toBe('Discards at races 3, 5.');
    });

    it('handles first row already nonzero', () => {
      expect(racesWhereDiscardAllowanceIncreases([1, 2])).toEqual([1, 2]);
    });

    it('handles all zero', () => {
      expect(formatDiscardScheduleSummary([0, 0, 0])).toBe('No discards in this range (all zero).');
    });
  });

  describe('trigger races ↔ ladder', () => {
    it('sums duplicate triggers into allowance steps (four milestones ⇒ two plateaus)', () => {
      const ladder12 = discardLadderFromTriggerRaces([5, 5, 10, 10], 12);
      expect(ladder12).toEqual([0, 0, 0, 0, 2, 2, 2, 2, 2, 4, 4, 4]);
      expect(triggerRacesFromDiscardLadder(ladder12)).toEqual([5, 5, 10, 10]);
    });

    it('discards ladder to ordered triggers and round-trips length', () => {
      const t = [0, 0, 1, 1, 2];
      expect(triggerRacesFromDiscardLadder(t)).toEqual([3, 5]);
      expect(discardLadderFromTriggerRaces([3, 5], t.length)).toEqual(t);
    });

    it('all-zero ladder yields no triggers', () => {
      expect(triggerRacesFromDiscardLadder([0, 0, 0])).toEqual([]);
      expect(discardLadderFromTriggerRaces([], 5)).toEqual([0, 0, 0, 0, 0]);
    });

    it('legacy ladder round-trips via triggers for a span', () => {
      const t = discardTableFromLegacy(4, 3, 12);
      const tr = triggerRacesFromDiscardLadder(t);
      expect(discardLadderFromTriggerRaces(tr, t.length)).toEqual(t);
    });

    it('allows repeated triggers on one race (+2 jump)', () => {
      const issues = validateDiscardTriggerRaceSequence([10, 10]);
      expect(issues).toHaveLength(0);
      expect(discardLadderFromTriggerRaces([10, 10], 12)).toEqual([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2,
      ]);
    });

    it('flags out-of-order triggers', () => {
      const issues = validateDiscardTriggerRaceSequence([10, 5]);
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('padDiscardTableToLength', () => {
    it('fills with last element', () => {
      expect(padDiscardTableToLength([0, 0, 1], 6)).toEqual([0, 0, 1, 1, 1, 1]);
    });
  });

  describe('validateDiscardTable', () => {
    it('flags decrease and overrun', () => {
      expect(validateDiscardTable([0, 1, 0]).length).toBeGreaterThan(0);
      // Allowed discards must not exceed races sailed (`v ≤ race№`). Three after three races is valid; four is not.
      expect(validateDiscardTable([0, 0, 4]).some(i => i.raceIndex === 3)).toBe(true);
    });

    it('accepts monotone valid tables', () => {
      expect(validateDiscardTable([0, 0, 1, 1, 2])).toHaveLength(0);
    });
  });
});
