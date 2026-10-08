import type {
  ScannerContext,
  ScannerThinkingLevel,
  ScannerTimeFormat,
} from "@shared/scanner-context";

export type { ScannerContext, ScannerThinkingLevel, ScannerTimeFormat };

export const LOG = "resultsSheetScanner";

/** Firestore doc holding the system default model and thinking level. */
export const SCAN_AI_CONFIG_PATH = "system/private/settings/scanAi";

/** Fallback when `system/private/settings/scanAi` is missing or invalid. */
export const DEFAULT_SCAN_MODEL = "gemini-3.7-flash";

/** Fallback thinking level when the system doc omits a valid level. */
export const DEFAULT_SCAN_THINKING_LEVEL: ScannerThinkingLevel = "medium";

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
  thinkingLevel: ScannerThinkingLevel;
}

export interface SystemScanAiConfig {
  model: string;
  thinkingLevel: ScannerThinkingLevel;
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
 * Empty/missing/invalid → undefined.
 */
export function normalizeScanThinkingLevel(value: unknown): ScannerThinkingLevel | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (SCAN_THINKING_LEVELS.has(trimmed as ScannerThinkingLevel)) {
    return trimmed as ScannerThinkingLevel;
  }
  return undefined;
}

/** Map a Firestore snapshot (or missing doc) to usable scan defaults. */
export function parseSystemScanAiConfig(data: unknown): SystemScanAiConfig {
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    model: normalizeScanModel(rec["model"]),
    thinkingLevel: normalizeScanThinkingLevel(rec["thinkingLevel"]) ?? DEFAULT_SCAN_THINKING_LEVEL,
  };
}

/**
 * System defaults apply to every scan. A sys-admin may override model/thinking
 * on a single request; other callers' client values are ignored.
 */
export function resolveScanModelParams(
  system: SystemScanAiConfig,
  clientModel: unknown,
  clientThinking: unknown,
  allowClientOverride: boolean,
): ScanModelParams {
  if (allowClientOverride) {
    const overrideModel =
      typeof clientModel === "string" && clientModel.trim().length > 0
        ? clientModel.trim()
        : system.model;
    return {
      model: overrideModel,
      location: DEFAULT_SCAN_LOCATION,
      thinkingLevel: normalizeScanThinkingLevel(clientThinking) ?? system.thinkingLevel,
    };
  }
  return {
    model: system.model,
    location: DEFAULT_SCAN_LOCATION,
    thinkingLevel: system.thinkingLevel,
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
