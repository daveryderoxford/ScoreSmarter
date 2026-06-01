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
  /** Sheet already stored for this race at the canonical server path — skip upload before parse. */
  useStoredRaceSheet?: boolean;
}

export interface ScanRunState {
  status: 'running' | 'success' | 'error';
  stageMessage?: string;
  result?: ScanResponse;
  error?: string;
}

/** Image selected for scanning (storage path or inline bytes + optional UI preview). */
export type CaptureImage =
  | { kind: 'storagePath'; path: string; previewUrl?: string | null }
  | { kind: 'inline'; base64: string; mimeType: string; previewUrl: string };

export function isCaptureReady(img: CaptureImage | null): boolean {
  if (!img) return false;
  if (img.kind === 'storagePath') return !!img.path;
  return !!img.base64 && !!img.mimeType;
}

export function capturePreviewUrl(img: CaptureImage | null): string | null {
  if (!img) return null;
  return img.previewUrl ?? null;
}

export function toScanRunFields(
  img: CaptureImage | null,
): Pick<ScanRunRequest, 'useStoredRaceSheet' | 'imageBase64' | 'imageMimeType'> {
  if (!img) return {};
  if (img.kind === 'storagePath') {
    return { useStoredRaceSheet: true, imageBase64: null, imageMimeType: null };
  }
  return {
    useStoredRaceSheet: false,
    imageBase64: img.base64,
    imageMimeType: img.mimeType,
  };
}
