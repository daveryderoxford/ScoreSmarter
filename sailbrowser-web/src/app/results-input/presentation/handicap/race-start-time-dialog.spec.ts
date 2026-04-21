import { startOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  toElapsedOffsetMinutes,
  toStartDateFromElapsedOffset,
} from './race-start-time-dialog';

const scheduledStart = new Date(2026, 3, 20, 13, 30, 0);
const base = startOfDay(scheduledStart);

describe('race-start-time-dialog elapsed offset helpers', () => {
  it('converts an integer-minute offset to a Date on the race day', () => {
    const d = toStartDateFromElapsedOffset(scheduledStart, 5);
    expect(d.getTime()).toBe(base.getTime() + 5 * 60_000);
  });

  it('converts a decimal-minute offset preserving seconds', () => {
    const d = toStartDateFromElapsedOffset(scheduledStart, 5.5);
    expect(d.getTime()).toBe(base.getTime() + 5 * 60_000 + 30_000);
  });

  it('supports a negative offset that falls on the previous calendar day', () => {
    const d = toStartDateFromElapsedOffset(scheduledStart, -5);
    expect(d.getTime()).toBe(base.getTime() - 5 * 60_000);
    expect(d.getDate()).toBe(base.getDate() - 1);
  });

  it('round-trips zero, positive, and negative offsets via Date→minutes', () => {
    for (const offset of [-125.5, -5, 0, 0.5, 42, 180.25]) {
      const date = toStartDateFromElapsedOffset(scheduledStart, offset);
      const minutes = toElapsedOffsetMinutes(scheduledStart, date);
      expect(minutes).toBeCloseTo(offset, 6);
    }
  });

  it('rounds sub-second jitter to the nearest second when parsing an existing Date', () => {
    const noisy = new Date(base.getTime() + 5 * 60_000 + 30_250);
    expect(toElapsedOffsetMinutes(scheduledStart, noisy)).toBe(5.5);
  });
});
