/**
* Series Entry Management
* Operations on the 'series-entries' collection.
*/
import { inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  collectionData,
  deleteDoc,
  doc,
  DocumentReference,
  Firestore,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { compareSailNumbers, normalizeSailNumber } from 'app/boats/model/sail-number';
import { FirestoreTenantService } from 'app/club-tenant';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { map, of, tap } from 'rxjs';
import { SeriesEntry } from '../model/series-entry';
import { ensureEntryDivisions } from 'app/race-calender/model/division';
import { CurrentRaces } from './current-races-store';

/**
 * Partial `SeriesEntry` payload accepted by `updateEntry`. Optional fields
 * may be set to `null` to clear them on the wire (the typed converter
 * translates `null` to `deleteField()` on partial writes). Plain
 * `undefined` is *omitted* and leaves the existing value alone.
 */
export type SeriesEntryPartialUpdate =
  Omit<Partial<SeriesEntry>, 'personalHandicapBand' | 'crew' | 'club' | 'boatName'>
  & {
    personalHandicapBand?: PersonalHandicapBand | null;
    crew?: string | null;
    club?: string | null;
    boatName?: string | null;
  };

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
    const snapshot = await firestoreWrite(getDocs(q), 'Loading series entries');
    return snapshot.docs.map(doc => ensureEntryDivisions({ ...doc.data(), id: doc.id }));
  }

  /**
   * Fetch one series entry by id without subscribing. Returns `null` if missing.
   * Used by mutation paths that need authoritative state before writing.
   */
  async getSeriesEntry(id: string): Promise<SeriesEntry | null> {
    const snapshot = await firestoreWrite(getDoc(this.ref(id)), 'Loading series entry');
    if (!snapshot.exists()) return null;
    return ensureEntryDivisions({ ...snapshot.data(), id: snapshot.id });
  }

  private readonly selectedEntriesResource = rxResource({
    params: () => this.currentRaces.selectedSeriesIdsKey(),
    stream: () => {
      const selectedIds = this.currentRaces.selectedSeriesIds();
      if (selectedIds.length === 0) {
        return of([]);
      } else {
        const q = query(
          this.collection,
          where('seriesId', 'in', selectedIds)
        );
        return collectionData(q, { idField: 'id' }).pipe(
          map(entries => entries.map(ensureEntryDivisions).sort(sortEntries)),
          tap(entries => console.log(`SeriesEntryStore. Loaded ${entries.length} entries`))
        );
      }
    },
    defaultValue: []
  });

  /** Trim string fields if they exist on the update object */
  private tidyStrings<T extends Partial<SeriesEntry> | SeriesEntryPartialUpdate>(entry: T): T {
    const update = { ...entry };
    if (typeof update.helm === 'string') {
      update.helm = update.helm.trim();
    }
    if (typeof update.crew === 'string') {
      update.crew = update.crew.trim();
    }
    if (typeof update.boatClass === 'string') {
      update.boatClass = update.boatClass.trim();
    }
    if (update.sailNumber != null) {
      update.sailNumber = normalizeSailNumber(update.sailNumber);
    }
    return update;
  }

  readonly selectedEntries = this.selectedEntriesResource.value.asReadonly();
  readonly loading = this.selectedEntriesResource.isLoading;
  readonly error = this.selectedEntriesResource.error;

  async addEntry(entry: Partial<SeriesEntry>): Promise<string> {
    const update = this.tidyStrings(entry);
    const id = generateSecureID(10000, `SE-${update.boatClass}-${update.sailNumber}`);
    await firestoreWrite(setDoc(this.ref(id), update), 'Saving series entry');
    return id;
  }

  /**
   * Partial update of a series entry. Uses `setDoc({ merge: true })` rather
   * than `updateDoc` because the Firestore SDK only invokes the typed
   * converter (`dataObjectConverter`) on `setDoc`/`addDoc`. The converter is
   * what cleanses `undefined` (omit on partial writes) and `null`
   * (`deleteField()` on partial writes), so calling `updateDoc` here would
   * ship a raw `undefined` straight to the SDK and trigger
   * `invalid-argument: Unsupported field value: undefined`.
   *
   * Callers may pass `null` on optional fields to *clear* them; passing
   * `undefined` (or omitting the key) leaves the existing value alone.
   */
  async updateEntry(id: string, changes: SeriesEntryPartialUpdate) {
    const update = this.tidyStrings(changes);
    await firestoreWrite(
      setDoc(this.ref(id), update as SeriesEntry, { merge: true }),
      'Updating series entry',
    );
  }

  async deleteEntry(id: string) {
    await firestoreWrite(deleteDoc(this.ref(id)), 'Deleting series entry');
  }

  /** Document ref for batch updates/deletes */
  seriesEntryDocRef(id: string): DocumentReference<SeriesEntry> {
    return this.ref(id);
  }
}

export function sortEntries(a: SeriesEntry, b: SeriesEntry): number {
  const classCompare = a.boatClass.localeCompare(b.boatClass);
  if (classCompare !== 0) {
    return classCompare;
  }
  return compareSailNumbers(a.sailNumber, b.sailNumber);
}
