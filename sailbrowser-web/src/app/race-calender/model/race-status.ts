/**
 * Race lifecycle. Future / In progress / Completed are set by the server from the
 * race's results; Canceled is set explicitly by a race officer or club admin.
 */
export const RACE_STATUSES = [
  'Future',
  'In progress',  // At least one entry has a result
  'Completed',    // Every entry has a result
  'Canceled',
] as const;

export type RaceStatus = typeof RACE_STATUSES[number];

/** Display label; the stored value keeps the original `Canceled` spelling. */
export function raceStatusLabel(status: RaceStatus): string {
  return status === 'Canceled' ? 'Cancelled' : status;
}

/** Races whose results have been entered (and are therefore published). */
export function hasResults(race: { status: RaceStatus }): boolean {
  return race.status === 'In progress' || race.status === 'Completed';
}

/**
 * Status from the race's result codes; same rule as the server's `raceResultsChanged`
 * trigger. Used when reinstating a cancelled race, which the trigger leaves alone.
 */
export function raceStatusFromResultCodes(codes: readonly string[]): Exclude<RaceStatus, 'Canceled'> {
  const started = codes.filter(code => code !== 'NOT FINISHED').length;
  if (started === 0) return 'Future';
  return started === codes.length ? 'Completed' : 'In progress';
}
