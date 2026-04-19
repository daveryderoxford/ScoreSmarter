/**
* Results Management
* Operations on the 'race-results' collection.
*/
import { inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { collectionData, deleteDoc, doc, Firestore, getDocs, query, updateDoc, where, setDoc } from '@angular/fire/firestore';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { FirestoreTenantService } from 'app/club-tenant';
import { map, of, tap } from 'rxjs';
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
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  /** Race competitors in selected races */
  private readonly selectedCompResource = rxResource<RaceCompetitor[], string[]>({
    params: () => this.selectedRaces.selectedRaceIds(),
    stream: (data) => {
      const selectedIds = data.params;
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
    await setDoc(this.ref(id), update);
    return id;
  }

  async updateResult(id: string, changes: Partial<RaceCompetitor>) {
    const update = this.tidyStrings(changes);
    await updateDoc(this.ref(id), update);
  }

  async deleteResult(id: string) {
    await deleteDoc(this.ref(id));
  }
}
