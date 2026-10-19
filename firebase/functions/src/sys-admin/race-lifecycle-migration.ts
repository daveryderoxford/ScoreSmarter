import { raceStatusFromCounts, type RaceStatus, type ResultsState } from "../races/race-lifecycle.js";

/** Statuses written before the lifecycle was reduced to Future / In progress / Completed / Canceled. */
export type LegacyRaceStatus = RaceStatus | "Published" | "Verified" | "Postponed" | "Archived";

export interface MigratedRaceFields {
  status: RaceStatus;
  resultsState: ResultsState;
}

/** Entries in a race and how many are still NOT FINISHED, from its race-results documents. */
export interface RaceResultCounts {
  entries: number;
  notFinished: number;
}

/** Legacy status mapped onto the new statuses, before checking the race's results. */
function mappedStatus(status: LegacyRaceStatus, counts: RaceResultCounts): RaceStatus {
  switch (status) {
    case "Published":
    case "Verified":
      return "Completed";
    case "Postponed":
      return "Future";
    case "Archived":
      return counts.entries > counts.notFinished ? "Completed" : "Canceled";
    default:
      return status;
  }
}

/**
 * New status and results state for a race document, or `null` when it already fits
 * the new model.
 *
 * - The status is recalculated from the race's results (as the `raceResultsChanged`
 *   trigger would), fixing statuses left stale by the old client-side logic. Cancelled
 *   races and races with no result documents keep their mapped status.
 * - Verified was never used, so races already Completed (including Published) are
 *   treated as reviewed and marked final. A race that only becomes Completed through
 *   the recalculation stays provisional so it is reviewed.
 * - An existing results state is never overwritten.
 */
export function migratedRaceFields(
  race: { status: LegacyRaceStatus; resultsState?: ResultsState },
  counts: RaceResultCounts,
): MigratedRaceFields | null {
  const mapped = mappedStatus(race.status, counts);
  const status = mapped !== "Canceled" && counts.entries > 0
    ? raceStatusFromCounts(counts.entries, counts.notFinished)
    : mapped;
  const resultsState: ResultsState =
    race.resultsState ?? (mapped === "Completed" && status === "Completed" ? "final" : "provisional");
  if (status === race.status && resultsState === race.resultsState) return null;
  return { status, resultsState };
}
