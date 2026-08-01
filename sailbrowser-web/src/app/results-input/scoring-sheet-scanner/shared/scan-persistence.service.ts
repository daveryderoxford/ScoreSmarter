import { inject, Injectable } from '@angular/core';
import { getDoc, setDoc } from '@angular/fire/firestore';
import { FirestoreTenantService } from 'app/club-tenant';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { applyAutoAccept, ScanResponse } from '../model/scan-model';

interface ScanResultDoc {
  scanResponse?: ScanResponse | null;
}

/**
 * Reads/clears the scan persisted for a race and prepares a stored scan for
 * review. Cross-area: used by both the run-scan and review-save flows. Document
 * references come from {@link FirestoreTenantService}, which scopes them to the
 * current club tenant.
 */
@Injectable()
export class ScanPersistenceService {
  private readonly tenant = inject(FirestoreTenantService);

  async getScanResponse(raceId: string): Promise<ScanResponse | null> {
    const snap = await firestoreWrite(
      getDoc(this.tenant.docRef<ScanResultDoc>('scan-results', raceId)),
      'Loading scan',
    );
    if (!snap.exists()) return null;
    const stored = snap.data()?.scanResponse;
    if (!stored || typeof stored !== 'object') return null;
    return stored as ScanResponse;
  }

  async clearScanResponse(raceId: string): Promise<void> {
    await firestoreWrite(
      setDoc(
        this.tenant.docRef<ScanResultDoc>('scan-results', raceId),
        { scanResponse: null },
        { merge: true },
      ),
      'Clearing scan',
    );
  }

  /** Applies the same auto-accept rules used after a live scan. */
  prepareScanResponseForReview(response: ScanResponse): ScanResponse {
    return applyAutoAccept(response);
  }
}
