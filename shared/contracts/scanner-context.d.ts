export type ScannerTimeFormat = "clock_hms" | "stopwatch_hms_elapsed" | "stopwatch_ms_elapsed";

/** Which backend parser pipeline to use for a scan. */
export type ScanStrategy = "FullAIScan" | "FullAIScan-Fast" | "SplitScan";

export type ScannerListOrder = "chronological" | "firstLap" | "unsorted";

/** Handicap (times) vs level-rating (finish positions across one or more races). */
export type ScannerScanMode = "handicap" | "levelRating";

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
  /** Parser pipeline; defaults to OCR-Typescript when omitted. */
  scanStrategy?: ScanStrategy;
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
