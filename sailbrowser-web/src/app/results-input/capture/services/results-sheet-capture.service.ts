import { Injectable, inject } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { resolveStorageDownloadUrl } from 'app/shared/firebase/storage-download';

const UPLOAD_RESULTS_SHEET_IMAGE_CALLABLE_TIMEOUT_MS = 120_000;

export interface UploadInlineImageOptions {
  clubId: string;
  raceId: string;
  base64: string;
  mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class ResultsSheetCaptureService {
  private readonly app = inject(FirebaseApp);

  async resolveDownloadUrl(path: string | null | undefined): Promise<string | null> {
    const trimmed = path?.trim();
    if (!trimmed) return null;
    return await resolveStorageDownloadUrl(this.app, trimmed);
  }

  async uploadInlineImage(
    { clubId, raceId, base64, mimeType }: UploadInlineImageOptions,
  ): Promise<{ storagePath: string }> {
    const uploadFn = await cloudCallable('uploadResultsSheetImage', {
      timeout: UPLOAD_RESULTS_SHEET_IMAGE_CALLABLE_TIMEOUT_MS,
    }, this.app);
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
}
