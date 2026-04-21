import { describe, expect, it } from 'vitest';
import { parseElapsedStopwatchReading } from './race-time-input';

describe('parseElapsedStopwatchReading', () => {
  const scheduledStart = new Date(2026, 3, 21, 13, 0, 0);

  it('parses stopwatch value against race-day midnight anchor', () => {
    const finish = parseElapsedStopwatchReading('00:23:00', scheduledStart);
    expect(finish).not.toBeNull();
    expect(finish?.toISOString()).toBe(new Date(2026, 3, 21, 0, 23, 0).toISOString());
  });

  it('supports finishes after midnight when start may be before midnight', () => {
    const finish = parseElapsedStopwatchReading('00:10:00', scheduledStart);
    const competitorStart = new Date(2026, 3, 20, 23, 58, 0);
    expect(finish).not.toBeNull();
    expect((finish?.getTime() ?? 0) > competitorStart.getTime()).toBe(true);
  });

  it('keeps consistent timeline with different competitor starts', () => {
    const finish = parseElapsedStopwatchReading('01:00:00', scheduledStart);
    const earlyStart = new Date(2026, 3, 20, 23, 55, 0);
    const lateStart = new Date(2026, 3, 21, 0, 10, 0);
    expect(finish).not.toBeNull();
    expect((finish?.getTime() ?? 0) > earlyStart.getTime()).toBe(true);
    expect((finish?.getTime() ?? 0) > lateStart.getTime()).toBe(true);
  });

  it('returns null for invalid stopwatch format', () => {
    expect(parseElapsedStopwatchReading('bad', scheduledStart)).toBeNull();
    expect(parseElapsedStopwatchReading('1:99:00', scheduledStart)).toBeNull();
  });
});
