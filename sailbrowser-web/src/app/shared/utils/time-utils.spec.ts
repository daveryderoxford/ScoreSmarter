import { startOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { dateAtSecondsOfDay, secondsSinceStartOfDay } from './time-utils';

const day = new Date(2026, 3, 20, 13, 30, 0);
const midnight = startOfDay(day);

describe('dateAtSecondsOfDay', () => {
  it('composes a clock time from seconds-of-day', () => {
    const d = dateAtSecondsOfDay(day, 14 * 3600 + 32 * 60 + 5);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(32);
    expect(d.getSeconds()).toBe(5);
    expect(startOfDay(d).getTime()).toBe(midnight.getTime());
  });

  it('adds an elapsed offset to local midnight of the anchor', () => {
    const d = dateAtSecondsOfDay(day, 5 * 60 + 30);
    expect(d.getTime()).toBe(midnight.getTime() + (5 * 60 + 30) * 1000);
  });

  it('supports offsets beyond an hour', () => {
    const d = dateAtSecondsOfDay(day, 83 * 60 + 30);
    expect(d.getTime()).toBe(midnight.getTime() + (83 * 60 + 30) * 1000);
  });
});

describe('secondsSinceStartOfDay', () => {
  it('decomposes a clock time to seconds-of-day (reference defaults to the date)', () => {
    const clock = new Date(2026, 3, 20, 14, 32, 5);
    expect(secondsSinceStartOfDay(clock)).toBe(14 * 3600 + 32 * 60 + 5);
  });

  it('decomposes an elapsed time relative to a reference day', () => {
    const finish = new Date(midnight.getTime() + (83 * 60 + 30) * 1000);
    expect(secondsSinceStartOfDay(finish, day)).toBe(83 * 60 + 30);
  });

  it('round-trips compose -> decompose for a range of offsets', () => {
    for (const seconds of [0, 30, 330, 2520, 50_000]) {
      const d = dateAtSecondsOfDay(day, seconds);
      expect(secondsSinceStartOfDay(d, day)).toBe(seconds);
    }
  });
});
