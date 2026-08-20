import type {
  ScannerContext,
  ScannerThinkingLevel,
  ScannerTimeFormat,
} from "@shared/scanner-context";

export type { ScannerContext, ScannerThinkingLevel, ScannerTimeFormat };

export const LOG = "resultsSheetScanner";

/** Default Gemini model when the client omits `scannerContext.model`. */
export const DEFAULT_SCAN_MODEL = "gemini-3.7-flash";

/** Vertex location for all AI scan calls. */
export const DEFAULT_SCAN_LOCATION = "global";

const SCAN_THINKING_LEVELS = new Set<ScannerThinkingLevel>([
  "minimal",
  "low",
  "medium",
  "high",
]);

export interface ScanModelParams {
  model: string;
  location: string;
  /** Set only when the client explicitly chose a thinking level. */
  thinkingLevel?: ScannerThinkingLevel;
}

/** Normalise client-provided model id; empty/missing falls back to the default. */
export function normalizeScanModel(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return DEFAULT_SCAN_MODEL;
}

/**
 * Accept lowercase or UPPERCASE thinking levels from the client.
 * Empty/missing/invalid → undefined (model default).
 */
export function normalizeScanThinkingLevel(value: unknown): ScannerThinkingLevel | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (SCAN_THINKING_LEVELS.has(trimmed as ScannerThinkingLevel)) {
    return trimmed as ScannerThinkingLevel;
  }
  return undefined;
}

export function resolveScanModelParams(
  model: unknown,
  thinkingLevel?: unknown,
): ScanModelParams {
  const normalizedThinking = normalizeScanThinkingLevel(thinkingLevel);
  return {
    model: normalizeScanModel(model),
    location: DEFAULT_SCAN_LOCATION,
    ...(normalizedThinking ? { thinkingLevel: normalizedThinking } : {}),
  };
}

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
  | "parse_model_json"
  | "persist_scan_response"
  | "persist_scan_metrics";

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
  sailNumber?: string;
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
