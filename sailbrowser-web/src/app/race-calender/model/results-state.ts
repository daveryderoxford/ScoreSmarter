/**
 * Whether a race's published results are confirmed. Results are published as
 * provisional; only a club admin marks a Completed race final.
 */
export const RESULTS_STATES = ['provisional', 'final'] as const;

export type ResultsState = typeof RESULTS_STATES[number];

/** A missing results state means provisional. */
export function resultsStateOf(race: { resultsState?: ResultsState }): ResultsState {
  return race.resultsState ?? 'provisional';
}

export function resultsStateLabel(state: ResultsState): string {
  return state === 'final' ? 'Final' : 'Provisional';
}
