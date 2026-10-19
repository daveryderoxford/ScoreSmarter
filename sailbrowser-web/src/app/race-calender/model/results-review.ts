import type { Race } from './race';
import { hasResults } from './race-status';
import { resultsStateOf } from './results-state';

/**
 * Past races a club admin still needs to deal with: races still Future (results
 * missing, or the race should be cancelled) and races with results that are not yet
 * marked final.
 */
export function racesAwaitingReview(races: readonly Race[], now: Date = new Date()): Race[] {
  return races.filter(
    r => r.scheduledStart < now && (r.status === 'Future' || (hasResults(r) && resultsStateOf(r) === 'provisional')),
  );
}

/** Final can only be set once every entry has a result. */
export function canMarkFinal(race: Pick<Race, 'status'>): boolean {
  return race.status === 'Completed';
}
