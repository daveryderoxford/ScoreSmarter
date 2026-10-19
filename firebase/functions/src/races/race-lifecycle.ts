/** Mirrors `RaceStatus` / `ResultsState` in sailbrowser-web/src/app/race-calender/model. */
export type RaceStatus = "Future" | "In progress" | "Completed" | "Canceled";
export type ResultsState = "provisional" | "final";
export type ComputedRaceStatus = Exclude<RaceStatus, "Canceled">;

/** Result code stored on a race-results document until the competitor has a result. */
export const NOT_FINISHED = "NOT FINISHED";

/**
 * Race status from counts of its entries: no results yet is Future, some is
 * In progress, all is Completed.
 */
export function raceStatusFromCounts(entries: number, notFinished: number): ComputedRaceStatus {
  const started = entries - notFinished;
  if (started <= 0) return "Future";
  return notFinished === 0 ? "Completed" : "In progress";
}

export interface RaceLifecycleFields {
  status: RaceStatus;
  resultsState?: ResultsState;
}

/**
 * Fields to write after a race's results changed, or `null` when nothing changes.
 * `nextStatus` is omitted when no result code changed, so only the results state is
 * affected. Cancelled races are left alone; a final race goes back to provisional
 * because its results now need a fresh review.
 */
export function raceLifecycleUpdate(
  race: RaceLifecycleFields,
  nextStatus?: ComputedRaceStatus,
): Partial<RaceLifecycleFields> | null {
  if (race.status === "Canceled") return null;
  const update: Partial<RaceLifecycleFields> = {};
  if (nextStatus && nextStatus !== race.status) update.status = nextStatus;
  if (race.resultsState === "final") update.resultsState = "provisional";
  return Object.keys(update).length > 0 ? update : null;
}

interface ResultDocFields {
  raceId?: unknown;
  resultCode?: unknown;
}

export interface RaceToRecompute {
  raceId: string;
  /** False when only non-status fields changed (e.g. a finish time), so counts are skipped. */
  recomputeStatus: boolean;
}

/**
 * Races affected by a write to one race-results document. A result moved between
 * races affects both; an edit that keeps the same result code cannot change the
 * race status.
 */
export function racesToRecompute(
  before: ResultDocFields | undefined,
  after: ResultDocFields | undefined,
): RaceToRecompute[] {
  const beforeRace = typeof before?.raceId === "string" ? before.raceId : undefined;
  const afterRace = typeof after?.raceId === "string" ? after.raceId : undefined;

  if (beforeRace && afterRace && beforeRace === afterRace) {
    const codeChanged = (before?.resultCode ?? NOT_FINISHED) !== (after?.resultCode ?? NOT_FINISHED);
    return [{ raceId: afterRace, recomputeStatus: codeChanged }];
  }

  return [beforeRace, afterRace]
    .filter((id): id is string => !!id)
    .map((raceId) => ({ raceId, recomputeStatus: true }));
}
