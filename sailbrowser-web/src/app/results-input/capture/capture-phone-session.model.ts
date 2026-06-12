import type { ScanResponse } from '../scoring-sheet-scanner/model/scan-model';

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
