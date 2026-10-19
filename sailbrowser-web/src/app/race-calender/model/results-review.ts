import type { Race } from './race';
import { hasResults } from './race-status';
import { resultsStateOf } from './results-state';

/** Past races with results that a club admin has not yet marked final. */
export function racesAwaitingReview(races: readonly Race[], now: Date = new Date()): Race[] {
  return races.filter(
    r => r.scheduledStart < now && hasResults(r) && resultsStateOf(r) === 'provisional',
  );
}

/** Final can only be set once every entry has a result. */
export function canMarkFinal(race: Pick<Race, 'status'>): boolean {
  return race.status === 'Completed';
}
