import type { RaceStatus, ResultsState } from "../races/race-lifecycle.js";

/** Statuses written before the lifecycle was reduced to Future / In progress / Completed / Canceled. */
export type LegacyRaceStatus = RaceStatus | "Published" | "Verified" | "Postponed" | "Archived";

export interface MigratedRaceFields {
  status: RaceStatus;
  resultsState: ResultsState;
}

/**
 * New status and results state for a race document, or `null` when it already fits
 * the new model. `hasResults` is whether any of its entries has a result.
 *
 * Verified was never used, so every race that ends up Completed (including Published
 * and archived races with results) is treated as already reviewed and marked final.
 * An existing results state is never overwritten.
 */
export function migratedRaceFields(
  race: { status: LegacyRaceStatus; resultsState?: ResultsState },
  hasResults: boolean,
): MigratedRaceFields | null {
  let status: RaceStatus;
  switch (race.status) {
    case "Published":
    case "Verified":
      status = "Completed";
      break;
    case "Postponed":
      status = "Future";
      break;
    case "Archived":
      status = hasResults ? "Completed" : "Canceled";
      break;
    default:
      status = race.status;
  }
  const resultsState: ResultsState = race.resultsState ?? (status === "Completed" ? "final" : "provisional");
  if (status === race.status && resultsState === race.resultsState) return null;
  return { status, resultsState };
}
