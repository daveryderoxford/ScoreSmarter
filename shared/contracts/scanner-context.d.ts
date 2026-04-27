export type ScannerTimeFormat = "clock_hms" | "stopwatch_hms_elapsed" | "stopwatch_ms_elapsed";

export type ScannerLapFormat = "numbers" | "ticks";
export type ScannerListOrder = "chronological" | "firstLap" | "unsorted";

export interface ScannerRosterEntry {
  class: string;
  sailNumber: string;
  name?: string;
  id: string;
}

export interface ScannerContext {
  targetRaces: string[];
  lapFormat: ScannerLapFormat;
  defaultLaps?: number;
  hasHours: boolean;
  defaultHour?: number;
  listOrder: ScannerListOrder;
  classAliases?: Record<string, string>;
  roster: ScannerRosterEntry[];
  /** When false, the sheet has no lap column; use defaultLaps per row. Defaults to true if omitted. */
  lapsPresentOnSheet?: boolean;
  timeFormat?: ScannerTimeFormat;
}
