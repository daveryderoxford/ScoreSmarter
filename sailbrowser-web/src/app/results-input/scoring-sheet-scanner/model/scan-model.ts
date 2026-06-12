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

/** Phone-capture session metadata returned by `createPhoneUploadRequest`. */
export interface CaptureSession {
  sessionId: string;
  token: string;
  clubId: string;
  raceId: string;
  expiresAt: string;
}

/** Live state of a phone-capture session document in Firestore. */
export interface CaptureSessionDoc {
  status?: string;
  storagePath?: string;
  uploadedAt?: Date;
  expiresAt?: Date;
  scanResponse?: ScanResponse;
}

export interface UploadFromSessionInput {
  clubId: string;
  sessionId: string;
  token: string;
  imageBase64: string;
  imageMimeType: string;
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

/** Summary view of a race's configured start times (Area 1: select race). */
export interface StartTimesSummary {
  title: string;
  configured: boolean;
  lines: string[];
}

/** Typed reactive form for the scanner-context setup step (Area 3: run scan). */
export interface ScannerContextForm {
  listOrder: FormControl<string>;
  timeFormat: FormControl<ScannerTimeFormat>;
  lapsPresentOnSheet: FormControl<boolean>;
  lapFormat: FormControl<string>;
  defaultHour: FormControl<number>;
  defaultLaps: FormControl<number>;
  scanStrategy: FormControl<ScanStrategy>;
}

/**
 * Source-agnostic signal that a fresh image was just acquired (Area 2: capture).
 * `autoAdvance` is true when the image was already reviewed at the source (e.g.
 * a phone capture), so the container may advance the stepper without the user
 * re-reviewing it.
 */
export interface AcquisitionEvent {
  at: number;
  autoAdvance: boolean;
}

/** Minimal render contract for the capture preview (Area 2: capture). */
export interface CapturePreview {
  src: string | null;
  loading: boolean;
  error: string | null;
}
