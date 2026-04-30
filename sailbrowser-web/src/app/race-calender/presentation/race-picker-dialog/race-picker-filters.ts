import type { RaceStatus } from '../../model/race-status';
import type { Race } from '../../model/race';

export type RacePickerMode = 'entry' | 'results' | 'scanner';

export type RacePickerPeriod =
  | 'today'
  | 'last7Days'
  | 'next7Days'
  | 'future'
  | 'past'
  | 'all';

export const DEFAULT_PERIODS_BY_MODE: Record<RacePickerMode, RacePickerPeriod[]> = {
  entry: ['today', 'next7Days', 'future', 'last7Days'],
  results: ['today', 'last7Days', 'past'],
  scanner: ['today', 'last7Days', 'past'],
};

export const DEFAULT_PERIOD_BY_MODE: Record<RacePickerMode, RacePickerPeriod> = {
  entry: 'today',
  results: 'today',
  scanner: 'today',
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function matchesPeriod(
  race: Race,
  period: RacePickerPeriod,
  now: Date,
): boolean {
  const scheduled = new Date(race.scheduledStart);
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);
  const diffDays = Math.floor((startOfLocalDay(scheduled).getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));

  switch (period) {
    case 'today':
      return scheduled >= todayStart && scheduled <= todayEnd;
    case 'last7Days':
      return diffDays >= -7 && diffDays <= -1;
    case 'next7Days':
      return diffDays >= 1 && diffDays <= 7;
    case 'future':
      return scheduled > todayEnd;
    case 'past':
      return scheduled < todayStart;
    case 'all':
      return true;
  }
}

export function statusesForHideIncomplete(hideIncomplete: boolean): RaceStatus[] {
  if (hideIncomplete) {
    return ['Future', 'In progress', 'Canceled', 'Postponed'];
  }
  return ['Future', 'In progress', 'Canceled', 'Postponed', 'Completed', 'Published', 'Verified'];
}

export function dayGroupSortDirection(period: RacePickerPeriod): 'asc' | 'desc' {
  if (period === 'past' || period === 'last7Days') return 'desc';
  return 'asc';
}

export function includesRace(
  race: Race,
  period: RacePickerPeriod,
  now: Date,
  hideIncomplete?: boolean,
  includeStatuses?: RaceStatus[],
): boolean {
  if (!matchesPeriod(race, period, now)) return false;

  const statuses = includeStatuses ?? statusesForHideIncomplete(!!hideIncomplete);
  if (!statuses) return true;
  return statuses.includes(race.status);
}

export function pickInitialPeriod(
  available: RacePickerPeriod[],
  preferred: RacePickerPeriod,
  races: Race[],
  preselectedRaceIds: string[],
  now: Date,
): RacePickerPeriod {
  if (available.includes(preferred)) {
    return preferred;
  }
  const fallback = available[0] ?? 'today';
  if (preselectedRaceIds.length === 0) return fallback;
  const selectedSet = new Set(preselectedRaceIds);
  const selectedRaces = races.filter(r => selectedSet.has(r.id));
  if (selectedRaces.length === 0) return fallback;
  for (const period of available) {
    if (selectedRaces.some(r => matchesPeriod(r, period, now))) return period;
  }
  return fallback;
}

