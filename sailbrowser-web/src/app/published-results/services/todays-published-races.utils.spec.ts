import { describe, expect, it } from 'vitest';
import type { PublishedSeason, SeriesInfo } from '../model/published-season';
import {
  isScheduledToday,
  isScheduledInRecentLocalDays,
  seriesOverlapsLocalDay,
  seriesOverlapsRecentLocalDays,
  uniqueSeriesCandidatesForDay,
  uniqueSeriesCandidatesForRecentDays,
} from './todays-published-races.utils';

function series(id: string, start: Date, end: Date, name = 'S'): SeriesInfo {
  return { id, name, fleetId: 'f1', startDate: start, endDate: end, raceCount: 1 };
}

describe('seriesOverlapsLocalDay', () => {
  it('returns true when the day lies inside the inclusive span', () => {
    const s = series('a', new Date(2026, 3, 1), new Date(2026, 3, 30));
    expect(seriesOverlapsLocalDay(s, new Date(2026, 3, 15))).toBe(true);
  });

  it('returns true on boundary start and end days', () => {
    const s = series('a', new Date(2026, 3, 10), new Date(2026, 3, 12));
    expect(seriesOverlapsLocalDay(s, new Date(2026, 3, 10))).toBe(true);
    expect(seriesOverlapsLocalDay(s, new Date(2026, 3, 12))).toBe(true);
  });

  it('returns false when the day is outside the span', () => {
    const s = series('a', new Date(2026, 3, 1), new Date(2026, 3, 5));
    expect(seriesOverlapsLocalDay(s, new Date(2026, 3, 6))).toBe(false);
  });
});

describe('uniqueSeriesCandidatesForDay', () => {
  it('dedupes the same series id across seasons', () => {
    const s = series('dup', new Date(2026, 3, 1), new Date(2026, 3, 30));
    const seasons: PublishedSeason[] = [
      { id: 'y1', name: 'Y1', series: [s] },
      { id: 'y2', name: 'Y2', series: [{ ...s, name: 'Dup again' }] },
    ];
    const day = new Date(2026, 3, 15);
    expect(uniqueSeriesCandidatesForDay(seasons, day)).toHaveLength(1);
    expect(uniqueSeriesCandidatesForDay(seasons, day)[0].id).toBe('dup');
  });
});

describe('isScheduledToday', () => {
  it('matches the local calendar day of `now`', () => {
    const now = new Date(2026, 5, 7, 12, 0, 0);
    expect(isScheduledToday(new Date(2026, 5, 7, 8, 0, 0), now)).toBe(true);
    expect(isScheduledToday(new Date(2026, 5, 6, 23, 59, 59), now)).toBe(false);
  });
});

describe('isScheduledInRecentLocalDays', () => {
  it('includes races on today and the inclusive cutoff day', () => {
    const now = new Date(2026, 3, 20, 12, 0, 0);
    expect(isScheduledInRecentLocalDays(new Date(2026, 3, 20, 8, 0, 0), 6, now)).toBe(true);
    expect(isScheduledInRecentLocalDays(new Date(2026, 3, 14, 23, 59, 0), 6, now)).toBe(true);
  });

  it('excludes races older than the cutoff day and future races', () => {
    const now = new Date(2026, 3, 20, 12, 0, 0);
    expect(isScheduledInRecentLocalDays(new Date(2026, 3, 13, 23, 59, 0), 6, now)).toBe(false);
    expect(isScheduledInRecentLocalDays(new Date(2026, 3, 21, 0, 0, 0), 6, now)).toBe(false);
  });
});

describe('seriesOverlapsRecentLocalDays', () => {
  it('returns true when the series span intersects the last 6 days', () => {
    const now = new Date(2026, 3, 20, 12, 0, 0);
    const s = series('recent', new Date(2026, 2, 1), new Date(2026, 3, 15));
    expect(seriesOverlapsRecentLocalDays(s, 6, now)).toBe(true);
  });

  it('returns false when the series ended before the cutoff', () => {
    const now = new Date(2026, 3, 20, 12, 0, 0);
    const s = series('old', new Date(2026, 1, 1), new Date(2026, 3, 13));
    expect(seriesOverlapsRecentLocalDays(s, 6, now)).toBe(false);
  });
});

describe('uniqueSeriesCandidatesForRecentDays', () => {
  it('keeps only series that overlap recent days and dedupes by id', () => {
    const now = new Date(2026, 3, 20, 12, 0, 0);
    const recent = series('dup', new Date(2026, 2, 1), new Date(2026, 3, 20), 'Recent');
    const old = series('old', new Date(2026, 0, 1), new Date(2026, 2, 1), 'Old');
    const seasons: PublishedSeason[] = [
      { id: 'a', name: 'A', series: [recent, old] },
      { id: 'b', name: 'B', series: [{ ...recent, name: 'Duplicate Recent' }] },
    ];

    const out = uniqueSeriesCandidatesForRecentDays(seasons, 6, now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('dup');
  });
});
