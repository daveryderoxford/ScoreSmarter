import { addSeconds, differenceInSeconds, startOfDay } from 'date-fns';

/**
 * Compose a `Date` from a day and a seconds offset measured from that day's local midnight.
 *
 * Covers both "apply a time-of-day" (seconds = seconds-of-day) and "add elapsed time"
 * (seconds = elapsed seconds, `day` = the anchor/scheduled start), since both are
 * `startOfDay(day) + seconds`.
 */
export function dateAtSecondsOfDay(day: Date, seconds: number): Date {
  return addSeconds(startOfDay(day), seconds);
}

/**
 * Decompose a `Date` into seconds since local midnight of `referenceDay`.
 *
 * Inverse of {@link dateAtSecondsOfDay}. For a clock time pass the date itself (default);
 * for an elapsed offset pass the scheduled start as `referenceDay`.
 */
export function secondsSinceStartOfDay(date: Date, referenceDay: Date = date): number {
  return differenceInSeconds(date, startOfDay(referenceDay));
}
