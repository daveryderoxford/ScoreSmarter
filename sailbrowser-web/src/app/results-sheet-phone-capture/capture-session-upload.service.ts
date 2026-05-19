import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../environments/environment';

/**
 * Upload-only callable for the phone capture lazy route ({@link MobileCapturePage}),
 * avoiding {@link ScannerOrchestrationService} and its Firestore / store graph.
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
    const functions = getFunctions(this.app, 'europe-west1');
    if (environment.useEmulators) {
      try { connectFunctionsEmulator(functions, 'localhost', 5001); } catch { /* already configured */ }
    }
    const fn = httpsCallable(functions, 'uploadImageFromPhone', { timeout: 120_000 });
    const res = await fn(payload);
    return res.data as { status: string; storagePath?: string };
  }
}
