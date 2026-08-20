export type ScannerTimeFormat = "clock_hms" | "stopwatch_hms_elapsed" | "stopwatch_ms_elapsed";

export type ScannerListOrder = "chronological" | "firstLap" | "unsorted";

/** Handicap (times) vs level-rating (finish positions across one or more races). */
export type ScannerScanMode = "handicap" | "levelRating";

/**
 * Gemini 3 thinking intensity. When omitted, the model uses its own default
 * (typically high for Pro, medium for Flash).
 */
export type ScannerThinkingLevel = "minimal" | "low" | "medium" | "high";

/** Competitor entry within a race's entry list. */
export interface ScannerRosterEntry {
  class: string;
  sailNumber: string;
  name?: string;
  id: string;
}

/**
 * One selected race for a scan, with its entry list.
 * Client may send `{ id, entries: [] }`; server fills entries and optional labels.
 */
export interface ScannerRace {
  id: string;
  seriesName?: string;
  raceNumber?: number;
  scheduledStartIso?: string;
  /** Club fleet class/name for this race (BoatClass → boatClassId, otherwise fleet name). */
  fleetClassName?: string;
  entries: ScannerRosterEntry[];
}

export interface ScannerContext {
  /** Selected races with per-race entry lists (server-populated entries). */
  races: ScannerRace[];
  defaultLaps?: number;
  defaultHour?: number;
  listOrder: ScannerListOrder;
  classAliases?: Record<string, string>;
  /** When false, the sheet has no lap column; use defaultLaps per row. Defaults to true if omitted. */
  lapsPresentOnSheet?: boolean;
  timeFormat?: ScannerTimeFormat;
  /** Gemini model id; server defaults when missing/empty. */
  model?: string;
  /** Gemini thinkingConfig.thinkingLevel; omit for the model default. */
  thinkingLevel?: ScannerThinkingLevel;
  /** Free-text sheet-specific instructions appended to the AI prompt when non-empty. */
  specialInstructions?: string;
  /** Defaults to handicap when omitted. */
  scanMode?: ScannerScanMode;
  /**
   * When true (sys-admin only), persist the full AI prompt on the scan metrics
   * document at `system/private/scans/{requestId}` for review.
   */
  debug?: boolean;
}
