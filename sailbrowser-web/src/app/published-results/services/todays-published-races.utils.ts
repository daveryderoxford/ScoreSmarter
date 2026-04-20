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

/** True when the series date span intersects the last N local calendar days. */
export function seriesOverlapsRecentLocalDays(info: SeriesInfo, days: number, now = new Date()): boolean {
  const today = localDateOnlyMs(now);
  const cutoff = localDateOnlyMs(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  return localDateOnlyMs(info.startDate) <= today && localDateOnlyMs(info.endDate) >= cutoff;
}

/** Same rule as {@link CurrentRaces} calendar "today" — local `toDateString`. */
export function isScheduledToday(scheduledStart: Date, now = new Date()): boolean {
  return new Date(scheduledStart).toDateString() === now.toDateString();
}

/** True when race local date is within the last N days (inclusive), ignoring time. */
export function isScheduledInRecentLocalDays(
  scheduledStart: Date,
  days: number,
  now = new Date(),
): boolean {
  const raceDay = localDateOnlyMs(new Date(scheduledStart));
  const today = localDateOnlyMs(now);
  const cutoff = localDateOnlyMs(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  return raceDay >= cutoff && raceDay <= today;
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

/** Dedupe by series id while preserving stable order for recent-day views. */
export function uniqueSeriesCandidatesForRecentDays(
  seasons: PublishedSeason[],
  days: number,
  now = new Date(),
): SeriesInfo[] {
  const seen = new Set<string>();
  const out: SeriesInfo[] = [];
  for (const season of seasons) {
    for (const s of season.series) {
      if (seen.has(s.id)) continue;
      if (!seriesOverlapsRecentLocalDays(s, days, now)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}
