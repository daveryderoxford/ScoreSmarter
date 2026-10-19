/** Mirrors `RaceStatus` / `ResultsState` in sailbrowser-web/src/app/race-calender/model. */
export type RaceStatus = "Future" | "In progress" | "Completed" | "Canceled";
export type ResultsState = "provisional" | "final";

/** Result code stored on a race-results document until the competitor has a result. */
export const NOT_FINISHED = "NOT FINISHED";

/**
 * Race status from its competitors' result codes: no results yet is Future, some is
 * In progress, all is Completed.
 */
export function raceStatusFromResultCodes(codes: readonly string[]): Exclude<RaceStatus, "Canceled"> {
  const started = codes.filter((code) => code !== NOT_FINISHED).length;
  if (started === 0) return "Future";
  return started === codes.length ? "Completed" : "In progress";
}

export interface RaceLifecycleFields {
  status: RaceStatus;
  resultsState?: ResultsState;
}

/**
 * Fields to write after a race's results changed, or `null` when nothing changes.
 * Cancelled races are left alone; a final race goes back to provisional because its
 * results now need a fresh review.
 */
export function raceLifecycleUpdate(
  race: RaceLifecycleFields,
  codes: readonly string[],
): Partial<RaceLifecycleFields> | null {
  if (race.status === "Canceled") return null;
  const update: Partial<RaceLifecycleFields> = {};
  const status = raceStatusFromResultCodes(codes);
  if (status !== race.status) update.status = status;
  if (race.resultsState === "final") update.resultsState = "provisional";
  return Object.keys(update).length > 0 ? update : null;
}
