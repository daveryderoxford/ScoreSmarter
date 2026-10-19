import { isSameDay } from 'date-fns';
import type { Race } from './race';

/** Series race number (1-based, in schedule order) and race-of-day for races already sorted by `sortRaces`. */
export function raceNumbering(sortedRaces: readonly Race[]): Map<string, Pick<Race, 'index' | 'raceOfDay'>> {
  const numbering = new Map<string, Pick<Race, 'index' | 'raceOfDay'>>();
  let dayCounter = 0;
  let lastDate: Date | null = null;
  sortedRaces.forEach((race, i) => {
    dayCounter = lastDate && isSameDay(race.scheduledStart, lastDate) ? dayCounter + 1 : 1;
    lastDate = race.scheduledStart;
    numbering.set(race.id, { index: i + 1, raceOfDay: dayCounter });
  });
  return numbering;
}
