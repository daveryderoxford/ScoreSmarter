import type { Race } from '../../model/race';
import type { RaceStatus } from '../../model/race-status';

export type RacesPanelPeriod = 'past' | 'future' | null;

/** Filters the consumer can choose to expose as chips in the panel. */
export type RacesPanelFilter = 'past' | 'future' | 'hideCompleted';

const COMPLETED_RACE_STATUSES: ReadonlySet<RaceStatus> = new Set([
  'Completed',
  'Published',
  'Verified',
]);

export function isCompletedRace(race: Race): boolean {
  return COMPLETED_RACE_STATUSES.has(race.status);
}

export interface RaceDayGroup {
  readonly dateKey: string;
  readonly heading: string;
  readonly races: Race[];
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function dayHeading(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function sortRacesByTimeThenIndex(a: Race, b: Race): number {
  return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime() || a.index - b.index;
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * Single-line race label for the panel: "<series> - Race <index>"
 * with " - <nth> race of day" appended when raceOfDay > 1.
 */
export function racePanelLabelLine1(race: Race): string {
  return `${race.seriesName} - Race ${race.index}`;
}

export function racePanelLabelLine2(race: Race): string | undefined{
  return race.raceOfDay > 1 ? `${ordinal(race.raceOfDay)} race of day` : undefined;
}

export function isScheduledToday(race: Race, now: Date): boolean {
  const scheduled = new Date(race.scheduledStart);
  return scheduled >= startOfLocalDay(now) && scheduled <= endOfLocalDay(now);
}

export function includesRaceForPanel(race: Race, period: RacesPanelPeriod, now: Date): boolean {
  if (isScheduledToday(race, now)) return true;
  const scheduled = new Date(race.scheduledStart);
  if (period === 'past') return scheduled < startOfLocalDay(now);
  if (period === 'future') return scheduled > endOfLocalDay(now);
  return false;
}

export function groupRacesForPanel(races: readonly Race[], period: RacesPanelPeriod, now: Date): RaceDayGroup[] {
  const filtered = races
    .filter(race => includesRaceForPanel(race, period, now))
    .sort(sortRacesByTimeThenIndex);
  const byDay = new Map<string, Race[]>();

  for (const race of filtered) {
    const dateKey = new Date(race.scheduledStart).toDateString();
    const dayRaces = byDay.get(dateKey) ?? [];
    dayRaces.push(race);
    byDay.set(dateKey, dayRaces);
  }

  return [...byDay.entries()]
    .sort((a, b) => {
      const diff = new Date(a[1][0].scheduledStart).getTime() - new Date(b[1][0].scheduledStart).getTime();
      return period === 'past' ? -diff : diff;
    })
    .map(([dateKey, dayRaces]) => ({
      dateKey,
      heading: dayHeading(dayRaces[0].scheduledStart),
      races: dayRaces,
    }));
}
