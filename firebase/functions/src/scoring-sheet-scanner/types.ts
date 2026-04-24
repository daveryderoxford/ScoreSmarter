import { HttpsError } from "firebase-functions/v2/https";

export const LOG = "parseResultsSheet";

/** Stages for logs and HttpsError.details.stage (client-visible). */
export type ScanStage =
  | "validate_input"
  | "assert_club_access"
  | "build_roster"
  | "merge_scanner_context"
  | "save_image"
  | "update_race_doc"
  | "build_prompt"
  | "vertex_generate"
  | "parse_model_json";

export interface ScanErrorDetails {
  requestId: string;
  stage: ScanStage;
  /** Short machine-readable hint (safe for logs / UI). */
  cause?: string;
  [key: string]: unknown;
}

export interface SeriesEntryDoc {
  helm?: string;
  boatClass?: string;
  sailNumber?: number;
}

export interface RaceCompetitorDoc {
  seriesEntryId?: string;
  raceId?: string;
}

export interface ScannerContext {
  targetRaces: string[];
  lapFormat: "numbers" | "ticks";
  defaultLaps?: number;
  hasHours: boolean;
  defaultHour?: number;
  listOrder: "chronological" | "firstLap" | "unsorted";
  classAliases?: Record<string, string>;
  roster: Array<{ class: string; sailNumber: string; name?: string; id: string }>;
  /** When false, the sheet has no lap column; use defaultLaps per row. Defaults to true if omitted. */
  lapsPresentOnSheet?: boolean;
  /**
   * How to read handwritten times. Defaults to clock-style if omitted (legacy clients).
   * - hours_minutes_seconds: clock or elapsed with optional hour (uses hasHours / defaultHour).
   * - minutes_seconds_only: race officer wrote only minutes and seconds (e.g. 45:30 = 45m 30s), not HH:MM.
   */
  timeFormat?: "hours_minutes_seconds" | "minutes_seconds_only";
}

export interface ParseResultsSheetRequest {
  imageBase64: string;
  imageMimeType?: string;
  scannerContext: ScannerContext;
  clubId: string;
  raceId: string;
}

export function logScan(
  requestId: string,
  stage: ScanStage,
  message: string,
  data?: Record<string, unknown>,
): void {
  const payload = { requestId, stage, ...data };
  console.log(JSON.stringify({ severity: "INFO", log: LOG, message, ...payload }));
}

export function logScanError(
  requestId: string,
  stage: ScanStage,
  message: string,
  data?: Record<string, unknown>,
): void {
  const payload = { requestId, stage, ...data };
  console.error(JSON.stringify({ severity: "ERROR", log: LOG, message, ...payload }));
}

export function httpsWithDetails(
  code: "invalid-argument" | "permission-denied" | "unauthenticated" | "not-found" | "failed-precondition" | "internal",
  message: string,
  details: ScanErrorDetails,
): HttpsError {
  return new HttpsError(code, message, details);
}
