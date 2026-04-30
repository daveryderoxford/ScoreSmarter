import { HttpsError } from "firebase-functions/v2/https";
import type { ScannerContext, ScannerTimeFormat } from "@shared/scanner-context";

export type { ScannerContext, ScannerTimeFormat };

export const LOG = "resultsSheetScanner";

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
  seriesEntryId: string;
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
