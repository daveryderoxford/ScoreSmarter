import type { ScannerThinkingLevel } from "./scanner-context";

/**
 * System-wide Gemini defaults for results-sheet scans.
 * Stored at Firestore `system/private/settings/scanAi`.
 * The Cloud Function reads this document on every scan (no cache).
 */
export interface ScanAiConfig {
  model: string;
  thinkingLevel: ScannerThinkingLevel;
  updatedAt?: Date;
  updatedBy?: string;
}
