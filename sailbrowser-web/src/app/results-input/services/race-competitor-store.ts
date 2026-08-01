/**
* Results Management
* Operations on the 'race-results' collection.
*/
import { inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  collectionData,
  deleteDoc,
  doc,
  DocumentReference,
  Firestore,
  getDocs,
  query,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { FirestoreTenantService } from 'app/club-tenant';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { of, tap } from 'rxjs';
import { RaceCompetitor } from '../model/race-competitor';
import { CurrentRaces } from './current-races-store';

@Injectable({
  providedIn: 'root',
})
export class RaceCompetitorStore {
  private readonly firestore = inject(Firestore);
  private selectedRaces = inject(CurrentRaces);
  private tenant = inject(FirestoreTenantService);

  private collection = this.tenant.collectionOf<RaceCompetitor>(RaceCompetitor, 'race-results');
  private ref = (id: string) => doc(this.collection, id);

  /**
   * Fetches all competitors for a series without monitoring for changes.
   */
  async getSeriesCompetitors(seriesId: string): Promise<RaceCompetitor[]> {
    const q = query(this.collection, where('seriesId', '==', seriesId));
    const snapshot = await firestoreWrite(getDocs(q), 'Loading race competitors');
    return snapshot.docs.map(doc => doc.data());
  }

  /**
   * All `race-results` rows referencing a series entry (club-wide query).
   * Used for orphan detection; not limited to currently selected races.
   */
  async getCompetitorsForSeriesEntry(seriesEntryId: string): Promise<RaceCompetitor[]> {
    const q = query(this.collection, where('seriesEntryId', '==', seriesEntryId));
    const snapshot = await firestoreWrite(getDocs(q), 'Loading series-entry competitors');
    return snapshot.docs.map(d => d.data());
  }

  /** Document ref for batch updates/deletes (same path as `addResult` / `updateResult`). */
  raceResultDocRef(id: string): DocumentReference<RaceCompetitor> {
    return doc(this.collection, id);
  }

  /** Race competitors in selected races */
  private readonly selectedCompResource = rxResource<RaceCompetitor[], string>({
    params: () => this.selectedRaces.selectedRaceIdsKey(),
    stream: () => {
      const selectedIds = this.selectedRaces.selectedRaceIds();
      if (selectedIds.length === 0) {
        return of([]);
      } else {
        const q = query(
          this.collection,
          where('raceId', 'in', selectedIds)
        );
        return collectionData(q).pipe(
          tap(rc => console.log(`RaceCompetitorStore. Loaded ${rc.length} competitors`))
        );
      }
    },
    defaultValue: []
  });

  /** Trim string fields that we still own on RaceCompetitor */
  private tidyStrings(comp: Partial<RaceCompetitor>): Partial<RaceCompetitor> {
    const update = { ...comp };
    if (typeof update.crewOverride === 'string') {
      update.crewOverride = update.crewOverride.trim();
    }
    return update;
  }

  readonly selectedCompetitors = this.selectedCompResource.value.asReadonly();
  readonly loading = this.selectedCompResource.isLoading;
  readonly error = this.selectedCompResource.error;

  async addResult(result: Partial<RaceCompetitor>): Promise<string> {
    const update = this.tidyStrings(result);
    const id = generateSecureID(10000, `RC-${update.seriesEntryId ?? 'unknown'}`);
    await firestoreWrite(setDoc(this.ref(id), update), 'Saving race result');
    return id;
  }

  /**
   * Partial update of a race competitor. Routed through
   * `setDoc({ merge: true })` (not `updateDoc`) so the typed
   * `classInstanceConverter` runs — converting `undefined` to "omit", `null`
   * to `deleteField()`, and `Date` to `Timestamp` exactly as documented in
   * `firestore-helper.ts`. `updateDoc` bypasses converters entirely in the
   * Firestore JS SDK.
   */
  async updateResult(id: string, changes: Partial<RaceCompetitor>) {
    const update = this.tidyStrings(changes);
    await firestoreWrite(setDoc(this.ref(id), update, { merge: true }), 'Updating race result');
  }

  async deleteResult(id: string) {
    await firestoreWrite(deleteDoc(this.ref(id)), 'Deleting race result');
  }
}
