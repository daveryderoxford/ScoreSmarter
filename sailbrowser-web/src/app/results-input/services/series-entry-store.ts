/**
* Series Entry Management
* Operations on the 'series-entries' collection.
*/
import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { collectionData, deleteDoc, doc, Firestore, query, updateDoc, where, setDoc, getDocs } from '@angular/fire/firestore';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { FirestoreTenantService } from 'app/club-tenant';
import { map, of, tap } from 'rxjs';
import { SeriesEntry } from '../model/series-entry';
import { CurrentRaces } from './current-races-store';

@Injectable({
  providedIn: 'root',
})
export class SeriesEntryStore {
  private readonly firestore = inject(Firestore);
  private currentRaces = inject(CurrentRaces);
  private tenant = inject(FirestoreTenantService);

  private collection = this.tenant.collectionRef<SeriesEntry>('series-entries');
  private ref = (id: string) => doc(this.collection, id);
  
  /**
   * Fetches all entries for a series without monitoring for changes.
   */
  async getSeriesEntries(seriesId: string): Promise<SeriesEntry[]> {
    const q = query(this.collection, where('seriesId', '==', seriesId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  }

  private readonly selectedSeriesIds = computed(() => this.currentRaces.selectedSeries().map(s => s.id));

  /** Series entries in selected races */
  private readonly selectedEntriesResource = rxResource({
    params: () => this.selectedSeriesIds(),
    stream: (data) => {
      const selectedIds = data.params;
      if (selectedIds.length === 0) {
        return of([]);
      } else {
        const q = query(
          this.collection,
          where('seriesId', 'in', selectedIds)
        );
        return collectionData(q, { idField: 'id' }).pipe(
          map(entries => entries.sort(sortEntries)),
          tap(entries => console.log(`SeriesEntryStore. Loaded ${entries.length} entries`))
        );
      }
    },
    defaultValue: []
  });

  /** Time string fields if they exist on the update object */
  private tidyStrings(entry: Partial<SeriesEntry>): Partial<SeriesEntry> {
    const update = { ...entry };
    if (update.helm) {
      update.helm = update.helm.trim();
    }
    if (update.crew) {
      update.crew = update.crew.trim();
    }
    if (update.boatClass) {
      update.boatClass = update.boatClass.trim();
    }
    return update;
  }

  readonly selectedEntries = this.selectedEntriesResource.value.asReadonly();
  readonly loading = this.selectedEntriesResource.isLoading;
  readonly error = this.selectedEntriesResource.error;

  async addEntry(entry: Partial<SeriesEntry>): Promise<string> {
    const update = this.tidyStrings(entry);
    const id = generateSecureID(10000, `SE-${update.boatClass}-${update.sailNumber}`);
    await setDoc(this.ref(id), update);
    return id;
  }

  async updateEntry(id: string, changes: Partial<SeriesEntry>) {
    const update = this.tidyStrings(changes);
    await updateDoc(this.ref(id), update);
  }

  async deleteEntry(id: string) {
    await deleteDoc(this.ref(id));
  }
}

/** Sort entries by boat class and sail number */
export function sortEntries(a: SeriesEntry, b: SeriesEntry): number {
  const classCompare = a.boatClass.localeCompare(b.boatClass);
  if (classCompare !== 0) {
    return classCompare;
  }
  return a.sailNumber - b.sailNumber;
}
