import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';

/**
 * Upload-only callable for the phone capture lazy route ({@link MobileCapturePage}),
 * avoiding {@link ScannerPhoneCaptureService} and its Firestore / store graph.
 */
@Injectable({ providedIn: 'root' })
export class CaptureSessionUploadService {
  private readonly app = inject(FirebaseApp);

  async uploadFromCaptureSession(payload: {
    clubId: string;
    sessionId: string;
    token: string;
    imageBase64: string;
    imageMimeType: string;
  }): Promise<{ status: string; storagePath?: string }> {
    const fn = await cloudCallable('uploadImageFromPhone', { timeout: 120_000 }, this.app);
    const res = await fn(payload);
    return res.data as { status: string; storagePath?: string };
  }
}
