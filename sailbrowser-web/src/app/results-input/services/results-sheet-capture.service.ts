import { Injectable, inject } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { MatDialog } from '@angular/material/dialog';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref as storageRef } from 'firebase/storage';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ScoringSheetCaptureDialog,
  ScoringSheetCaptureDialogData,
  ScoringSheetCaptureDialogResult,
} from '../presentation/scoring-sheet-capture-dialog/scoring-sheet-capture-dialog';

const UPLOAD_RESULTS_SHEET_IMAGE_CALLABLE_TIMEOUT_MS = 120_000;

export interface CaptureAndStoreOptions {
  clubId: string;
  raceId: string;
  isMobile: boolean;
}

export interface UploadInlineImageOptions {
  clubId: string;
  raceId: string;
  base64: string;
  mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class ResultsSheetCaptureService {
  private readonly app = inject(FirebaseApp);
  private readonly dialog = inject(MatDialog);

  /**
   * Resolve a Firebase Storage object path (as stored on `Race.resultsSheetImage`)
   * to an HTTPS download URL. Returns `null` for empty/missing paths and rethrows
   * underlying SDK errors so the caller can surface them.
   *
   * Callers are responsible for cancellation guards (e.g. version counters) when
   * the path can change while a resolution is pending.
   */
  async resolveDownloadUrl(path: string | null | undefined): Promise<string | null> {
    const trimmed = path?.trim();
    if (!trimmed) return null;
    return await getDownloadURL(storageRef(getStorage(this.app), trimmed));
  }

  /**
   * Upload an inline (base64) image to the `uploadResultsSheetImage` callable.
   * The callable persists the image in Storage and updates the race document's
   * `resultsSheetImage` field to the resulting `storagePath`.
   */
  async uploadInlineImage(
    { clubId, raceId, base64, mimeType }: UploadInlineImageOptions,
  ): Promise<{ storagePath: string }> {
    const functions = getFunctions(this.app, 'europe-west1');
    if (environment.useEmulators) {
      try { connectFunctionsEmulator(functions, 'localhost', 5001); } catch { /* already configured */ }
    }
    const uploadFn = httpsCallable(functions, 'uploadResultsSheetImage', {
      timeout: UPLOAD_RESULTS_SHEET_IMAGE_CALLABLE_TIMEOUT_MS,
    });
    const res = await uploadFn({
      imageBase64: base64,
      imageMimeType: mimeType,
      clubId,
      raceId,
    });
    const storagePath = (res.data as { storagePath?: string } | null)?.storagePath;
    if (!storagePath) throw new Error('Upload succeeded but no storagePath was returned.');
    return { storagePath };
  }

  /**
   * Open the shared capture dialog and resolve to the persisted `storagePath`
   * once the user confirms. Inline (PC camera / file upload) payloads are
   * uploaded via {@link uploadInlineImage}; phone-QR captures are already
   * stored when the dialog closes. Returns `null` when the user cancels.
   */
  async captureAndStore(
    { clubId, raceId, isMobile }: CaptureAndStoreOptions,
  ): Promise<{ storagePath: string } | null> {
    const ref = this.dialog.open<
      ScoringSheetCaptureDialog,
      ScoringSheetCaptureDialogData,
      ScoringSheetCaptureDialogResult | undefined
    >(ScoringSheetCaptureDialog, {
      width: 'min(95vw, 720px)',
      maxWidth: '95vw',
      disableClose: true,
      data: { clubId, raceId, isMobile },
    });

    const result = await firstValueFrom(ref.afterClosed());
    if (!result || result.outcome === 'cancelled') return null;
    if (result.outcome === 'stored') return { storagePath: result.storagePath };
    return await this.uploadInlineImage({
      clubId,
      raceId,
      base64: result.base64,
      mimeType: result.mimeType,
    });
  }
}
