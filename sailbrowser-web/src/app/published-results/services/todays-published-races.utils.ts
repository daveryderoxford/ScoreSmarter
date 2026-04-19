import type { PublishedSeason, SeriesInfo } from '../model/published-season';

/** Normalise to local midnight for calendar-day comparisons. */
export function localDateOnlyMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * True when the series' published date span includes the given calendar day
 * (local timezone). Used to avoid fetching races for series that cannot
 * possibly contain today's races.
 */
export function seriesOverlapsLocalDay(info: SeriesInfo, day: Date): boolean {
  const d = localDateOnlyMs(day);
  return localDateOnlyMs(info.startDate) <= d && localDateOnlyMs(info.endDate) >= d;
}

/** Same rule as {@link CurrentRaces} calendar "today" — local `toDateString`. */
export function isScheduledToday(scheduledStart: Date, now = new Date()): boolean {
  return new Date(scheduledStart).toDateString() === now.toDateString();
}

/** Dedupe by series id while preserving a stable order (first occurrence wins). */
export function uniqueSeriesCandidatesForDay(
  seasons: PublishedSeason[],
  day: Date,
): SeriesInfo[] {
  const seen = new Set<string>();
  const out: SeriesInfo[] = [];
  for (const season of seasons) {
    for (const s of season.series) {
      if (seen.has(s.id)) continue;
      if (!seriesOverlapsLocalDay(s, day)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}
