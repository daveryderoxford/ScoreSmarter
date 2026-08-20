import type { ScannerThinkingLevel } from "./scanner-context";

/** Metrics returned to the client after a scan completes. */
export interface ScanExecutionMetrics {
  success: boolean;
  errorMessage?: string;
  parser: "AIParser";
  model: string;
  /** Present when the client overrode the model thinking default. */
  thinkingLevel?: ScannerThinkingLevel;
  location: string;
  executionTimeSec: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedApiCostUsd: number | null;
  /** Correlates with `system/private/scans/{requestId}` (includes `aiPrompt` when debug is on). */
  requestId?: string;
}
