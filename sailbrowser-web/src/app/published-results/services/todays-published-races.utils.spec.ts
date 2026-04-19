import { describe, expect, it } from 'vitest';
import type { PublishedSeason, SeriesInfo } from '../model/published-season';
import {
  isScheduledToday,
  seriesOverlapsLocalDay,
  uniqueSeriesCandidatesForDay,
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
