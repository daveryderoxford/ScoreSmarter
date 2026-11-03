import type { RaceStatus } from './race-status';

export const SERIES_STATUSES = ['Future', 'In progress', 'Completed'] as const;

export type SeriesStatus = typeof SERIES_STATUSES[number];

/**
 * Series status worked out from its races (not stored):
 * Completed when no race is still to be sailed or in progress, In progress once any
 * race has results, otherwise Future. A series with no races is Future.
 */
export function seriesStatus(races: readonly { status: RaceStatus }[]): SeriesStatus {
  if (races.length === 0) return 'Future';
  const outstanding = races.some(r => r.status === 'Future' || r.status === 'In progress');
  if (!outstanding) return 'Completed';
  const started = races.some(r => r.status === 'In progress' || r.status === 'Completed');
  return started ? 'In progress' : 'Future';
}
