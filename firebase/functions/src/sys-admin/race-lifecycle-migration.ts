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
 */
export function migratedRaceFields(
  race: { status: LegacyRaceStatus; resultsState?: ResultsState },
  hasResults: boolean,
): MigratedRaceFields | null {
  let status: RaceStatus;
  let resultsState: ResultsState = race.resultsState ?? "provisional";
  switch (race.status) {
    case "Published":
      status = "Completed";
      break;
    case "Verified":
      status = "Completed";
      resultsState = "final";
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
  if (status === race.status && resultsState === race.resultsState) return null;
  return { status, resultsState };
}
