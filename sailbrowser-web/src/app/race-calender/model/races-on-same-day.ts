import { isSameDay } from 'date-fns';
import { sortRaces } from '../services/race-calendar-store-base';
import { Race } from './race';

/** Every race, across all series, scheduled on the same local date as `race`, in start order. */
export function racesOnSameDay(race: Pick<Race, 'scheduledStart'>, allRaces: readonly Race[]): Race[] {
  return allRaces
    .filter(r => isSameDay(r.scheduledStart, race.scheduledStart))
    .sort(sortRaces);
}
