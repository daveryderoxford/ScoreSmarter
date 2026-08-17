import type { Race } from '../../model/race';
import type { RaceStatus } from '../../model/race-status';
import { sortRaces } from '../../services/race-calendar-store-base';

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

export function isCanceledRace(race: Race): boolean {
  return race.status === 'Canceled';
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

/**
 * Default (no chip / `period === null`) shows today only; Past and Future add earlier or later days.
 * Today's races always pass so they stay visible when switching chips.
 */
export function isRaceVisibleForPeriodChip(
  race: Race,
  period: RacesPanelPeriod,
  now: Date,
): boolean {
  if (isScheduledToday(race, now)) return true;
  if (period === null) return false;
  const scheduled = new Date(race.scheduledStart);
  if (period === 'past') return scheduled < startOfLocalDay(now);
  return scheduled > endOfLocalDay(now);
}

/**
 * Which Past or Future chip to enable so a pre-selected race appears on open.
 * Not for today's races — they are always visible via `isRaceVisibleForPeriodChip`.
 */
export function periodChipNeededForRace(race: Race, now: Date): 'past' | 'future' {
  const scheduled = new Date(race.scheduledStart);
  return scheduled < startOfLocalDay(now) ? 'past' : 'future';
}

/** Appended to a consumer empty-message when the filtered race list is empty. */
export function emptyMessagePeriodSuffix(
  period: RacesPanelPeriod,
  hideCompleted: boolean,
  availableFilters: readonly RacesPanelFilter[],
): string {
  if (period === 'future') {
    return ' in future races';
  }
  if (period === 'past') {
    if (hideCompleted && availableFilters.includes('hideCompleted')) {
      return ' in past races that do not have complete results';
    }
    return ' in past races';
  }
  return ' today';
}

export function groupRacesForPanel(races: readonly Race[], period: RacesPanelPeriod, now: Date): RaceDayGroup[] {
  const filtered = races
    .filter(race => isRaceVisibleForPeriodChip(race, period, now))
    .sort(sortRaces);
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
