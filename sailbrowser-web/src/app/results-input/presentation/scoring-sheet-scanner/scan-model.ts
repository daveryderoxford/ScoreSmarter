import type { ScannerContext as SharedScannerContext } from '@shared/scanner-context';

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
}

export type ScannerContext = SharedScannerContext;

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
