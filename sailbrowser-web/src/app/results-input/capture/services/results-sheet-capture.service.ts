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
  storedImagePath?: string | null;
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

  async resolveDownloadUrl(path: string | null | undefined): Promise<string | null> {
    const trimmed = path?.trim();
    if (!trimmed) return null;
    return await getDownloadURL(storageRef(getStorage(this.app), trimmed));
  }

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

  async captureAndStore(
    { clubId, raceId, isMobile, storedImagePath }: CaptureAndStoreOptions,
  ): Promise<{ storagePath: string } | null> {
    const ref = this.dialog.open<
      ScoringSheetCaptureDialog,
      ScoringSheetCaptureDialogData,
      ScoringSheetCaptureDialogResult | undefined
    >(ScoringSheetCaptureDialog, {
      width: 'min(95vw, 720px)',
      maxWidth: '95vw',
      disableClose: true,
      data: { clubId, raceId, isMobile, storedImagePath },
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
