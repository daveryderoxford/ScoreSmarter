export interface ScannedValue<T> {
  value: T;
  confidence: 'HIGH' | 'MANUAL_CHECK' | 'FAILED' | 'AMBIGUOUS';
  alternatives?: T[];
}

export interface ScannedResultRow {
  rowIndex: number;
  boatClass?: ScannedValue<string>;
  sailNumber?: ScannedValue<string>;
  competitorName?: ScannedValue<string>;
  time?: ScannedValue<string>;
  laps?: ScannedValue<number>;
  status?: string;
  overallRowConfidence: string;
  matchedCompetitorId?: string;
  accepted?: boolean;
}

export interface ScanResponse {
  scannedResults: ScannedResultRow[];
  pageNotes?: string;
  unreadableRowsCount: number;
}

export interface ScannerContext {
  targetRaces: string[];
  lapFormat: 'numbers' | 'ticks';
  hasHours: boolean;
  defaultHour?: number | null;
  defaultLaps?: number | null;
  listOrder: 'chronological' | 'firstLap' | 'unsorted';
  classAliases: Record<string, string>;
  roster: Array<{ id: string; class: string; sailNumber: string; name?: string }>;
  lapsPresentOnSheet: boolean;
  timeFormat: 'hours_minutes_seconds' | 'minutes_seconds_only';
}

export interface ScanRunRequest {
  raceId: string;
  clubId: string;
  scannerContext: ScannerContext;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  mockMode?: boolean;
}

export interface ScanRunState {
  status: 'running' | 'success' | 'error';
  stageMessage?: string;
  result?: ScanResponse;
  error?: string;
}
