import type { Race } from 'app/race-calendar/model/race';
import { hasResults } from 'app/race-calendar/model/race-status';
import type { Season } from 'app/race-calendar/model/season';
import type { Series } from 'app/race-calendar/model/series';

/**
 * An open meeting: a few days of racing for one or more classes. Each class is an ordinary
 * series with `eventId` set; scoring stays on the series.
 */
export interface OpenEvent {
  id: string;
  seasonId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  noticeOfRaceUrl?: string;
  sailingInstructionsUrl?: string;
}

export function seriesForEvent(eventId: string, series: readonly Series[]): Series[] {
  return series
    .filter(s => s.eventId === eventId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Racing has started once any race in the event has a result. Cancelled races do not count. */
export function eventRacingStarted(eventSeriesIds: readonly string[], races: readonly Race[]): boolean {
  const ids = new Set(eventSeriesIds);
  return races.some(r => ids.has(r.seriesId) && hasResults(r));
}

export function sortEvents(a: OpenEvent, b: OpenEvent): number {
  return a.startDate.getTime() - b.startDate.getTime() || a.name.localeCompare(b.name);
}

/** Events in seasons marked current, by start date. */
export function currentSeasonEvents(events: readonly OpenEvent[], seasons: readonly Season[]): OpenEvent[] {
  const current = new Set(seasons.filter(s => s.status === 'current').map(s => s.id));
  return events.filter(e => current.has(e.seasonId)).sort(sortEvents);
}

export interface SeasonEvents {
  season: Season;
  events: OpenEvent[];
}

/** Events grouped by season, in the club's season order; seasons without events are left out. */
export function eventsBySeason(events: readonly OpenEvent[], seasons: readonly Season[]): SeasonEvents[] {
  return seasons
    .map(season => ({ season, events: events.filter(e => e.seasonId === season.id).sort(sortEvents) }))
    .filter(group => group.events.length > 0);
}
