import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { docData } from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import { CaptureSessionUploadService } from 'app/results-sheet-phone-capture/capture-session-upload.service';
import { FirestoreTenantService } from 'app/club-tenant';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { CaptureSession, CaptureSessionDoc, UploadFromSessionInput } from '../capture-phone-session.model';

/**
 * Manages phone-capture sessions: creating an upload request, relaying the
 * device upload, and watching the session document for completion. The session
 * document reference is scoped to the current club via
 * {@link FirestoreTenantService}.
 */
@Injectable({ providedIn: 'root' })
export class ScannerPhoneCaptureService {
  private readonly app = inject(FirebaseApp);
  private readonly tenant = inject(FirestoreTenantService);
  private readonly captureSessionUpload = inject(CaptureSessionUploadService);

  async createCaptureSession(clubId: string, raceId: string): Promise<CaptureSession> {
    const createFn = await cloudCallable('createPhoneUploadRequest', { timeout: 60_000 }, this.app);
    const res = await createFn({ clubId, raceId });
    return res.data as CaptureSession;
  }

  async uploadFromCaptureSession(payload: UploadFromSessionInput): Promise<{ status: string; storagePath?: string }> {
    return this.captureSessionUpload.uploadFromCaptureSession(payload);
  }

  watchCaptureSession(sessionId: string): Observable<CaptureSessionDoc | null> {
    const ref = this.tenant.docRef<CaptureSessionDoc>('results-sheet-capture-sessions', sessionId);
    return docData(ref).pipe(map(v => (v ?? null) as CaptureSessionDoc | null));
  }
}
