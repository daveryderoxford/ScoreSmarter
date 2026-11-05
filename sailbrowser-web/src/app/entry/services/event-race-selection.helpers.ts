import type { Race } from 'app/race-calendar/model/race';
import type { Series } from 'app/race-calendar/model/series';

/**
 * Race selection after a tick or untick. An open-event series is entered as a whole: ticking one
 * of its races adds every eligible race that has not started, and unticking one removes them all.
 * Club series races stay individual.
 */
export function selectWholeEventSeries(
  previous: readonly Race[],
  next: readonly Race[],
  eligible: readonly Race[],
  allSeries: readonly Series[],
): Race[] {
  const eventSeriesIds = new Set(allSeries.filter(s => s.eventId).map(s => s.id));
  const previousIds = new Set(previous.map(r => r.id));
  const nextIds = new Set(next.map(r => r.id));
  const removed = new Set(
    previous.filter(r => !nextIds.has(r.id) && eventSeriesIds.has(r.seriesId)).map(r => r.seriesId),
  );
  const added = new Set(
    next.filter(r => !previousIds.has(r.id) && eventSeriesIds.has(r.seriesId)).map(r => r.seriesId),
  );

  const kept = next.filter(r => !removed.has(r.seriesId));
  const keptIds = new Set(kept.map(r => r.id));
  const rest = eligible.filter(
    r => added.has(r.seriesId) && !removed.has(r.seriesId) && r.status === 'Future' && !keptIds.has(r.id),
  );
  return [...kept, ...rest];
}

/** Names of the open-event series among `races`, in first-seen order. */
export function eventSeriesNames(races: readonly Race[], allSeries: readonly Series[]): string[] {
  const names: string[] = [];
  for (const race of races) {
    const series = allSeries.find(s => s.id === race.seriesId);
    if (series?.eventId && !names.includes(series.name)) names.push(series.name);
  }
  return names;
}
