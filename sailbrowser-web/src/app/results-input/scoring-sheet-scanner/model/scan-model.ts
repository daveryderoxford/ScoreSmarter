import type { FormControl } from '@angular/forms';
import type {
  ScannerContext as SharedScannerContext,
  ScannerTimeFormat,
  ScanStrategy,
} from '@shared/scanner-context';
import type { ScanExecutionMetrics as SharedScanExecutionMetrics } from '@shared/scan-metrics';

export type ScanExecutionMetrics = SharedScanExecutionMetrics;

export interface ScannedValue<T> {
  value: T;
  confidence: 'HIGH' | 'MANUAL_CHECK' | 'FAILED' | 'AMBIGUOUS';
  alternatives?: T[];
}

export interface ScanEntryDetails {
  id: string;
  class: string;
  sailNumber: string;
  name?: string;
  helm?: string;
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
  metrics?: ScanExecutionMetrics;
}

export type ScannerContext = SharedScannerContext;

export interface ScanRunRequest {
  raceId: string;
  clubId: string;
  scannerContext: ScannerContext;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  /** Sheet already stored for this race at the canonical server path — skip upload before parse. */
  useStoredRaceSheet?: boolean;
}

export interface ScanRunState {
  status: 'running' | 'success' | 'error';
  stageMessage?: string;
  result?: ScanResponse;
  metrics?: ScanExecutionMetrics;
  error?: string;
}

/**
 * Applies the auto-accept rules shared by the live scan run and the stored-scan
 * read: a row is pre-accepted only when its overall, sail-number, and time
 * confidences are all HIGH. Pure; safe to reuse across services.
 */
export function applyAutoAccept(response: ScanResponse): ScanResponse {
  const { metrics, ...scanPayload } = response;
  const scannedResults = scanPayload.scannedResults.map(row => ({
    ...row,
    accepted: row.overallRowConfidence === 'HIGH' &&
      row.sailNumber?.confidence === 'HIGH' &&
      row.time?.confidence === 'HIGH',
  }));
  return { ...scanPayload, scannedResults, ...(metrics ? { metrics } : {}) };
}

/** Typed reactive form for the scanner-context setup step (Area 3: run scan). */
export interface ScannerContextForm {
  listOrder: FormControl<string>;
  timeFormat: FormControl<ScannerTimeFormat>;
  defaultLaps: FormControl<number>;
  scanStrategy: FormControl<ScanStrategy>;
}
