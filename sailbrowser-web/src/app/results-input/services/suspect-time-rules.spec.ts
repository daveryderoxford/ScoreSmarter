import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES,
  isSuspectElapsedOrLapTime,
  isSuspectIncludingCorrected,
  resolveSuspectTimeRules,
} from './suspect-time-rules';

describe('suspect-time-rules', () => {
  it('uses club defaults when no overrides are provided', () => {
    const rules = resolveSuspectTimeRules();
    expect(rules.minElapsedSeconds).toBe(DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES.minElapsedMinutes * 60);
    expect(rules.maxElapsedSeconds).toBe(DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES.maxElapsedMinutes * 60);
    expect(rules.minLapSeconds).toBe(DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES.minLapMinutes * 60);
    expect(rules.maxLapSeconds).toBe(DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES.maxLapMinutes * 60);
  });

  it('flags elapsed or average lap outside configured range', () => {
    const rules = resolveSuspectTimeRules();
    expect(isSuspectElapsedOrLapTime(4 * 60, 10 * 60, rules)).toBe(true);
    expect(isSuspectElapsedOrLapTime(30 * 60, 1 * 60, rules)).toBe(true);
    expect(isSuspectElapsedOrLapTime(30 * 60, 10 * 60, rules)).toBe(false);
  });

  it('flags corrected time using elapsed-time thresholds', () => {
    const rules = resolveSuspectTimeRules();
    expect(isSuspectIncludingCorrected(30 * 60, 10 * 60, 4 * 60, rules)).toBe(true);
    expect(isSuspectIncludingCorrected(30 * 60, 10 * 60, 30 * 60, rules)).toBe(false);
  });
});
