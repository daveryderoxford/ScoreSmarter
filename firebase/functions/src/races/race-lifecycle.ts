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
  /** False when no entry moved to or from NOT FINISHED, so counts are skipped. */
  recomputeStatus: boolean;
}

function isNotFinished(doc: ResultDocFields | undefined): boolean {
  return (doc?.resultCode ?? NOT_FINISHED) === NOT_FINISHED;
}

/**
 * Races affected by a write to one race-results document. A result moved between
 * races affects both. Within a race the status only changes when an entry moves
 * between NOT FINISHED and any other code (e.g. OK to DNF cannot change it).
 */
export function racesToRecompute(
  before: ResultDocFields | undefined,
  after: ResultDocFields | undefined,
): RaceToRecompute[] {
  const beforeRace = typeof before?.raceId === "string" ? before.raceId : undefined;
  const afterRace = typeof after?.raceId === "string" ? after.raceId : undefined;

  if (beforeRace && afterRace && beforeRace === afterRace) {
    return [{ raceId: afterRace, recomputeStatus: isNotFinished(before) !== isNotFinished(after) }];
  }

  return [beforeRace, afterRace]
    .filter((id): id is string => !!id)
    .map((raceId) => ({ raceId, recomputeStatus: true }));
}
