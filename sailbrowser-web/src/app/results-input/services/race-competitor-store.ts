/**
* Results Management
* Operations on the 'race-results' collection.
*/
import { computed, inject, Injectable } from '@angular/core';
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
import { combineLatest, map, of, tap } from 'rxjs';
import { RaceCompetitor } from '../model/race-competitor';
import { CurrentRaces } from './current-races-store';

/** Firestore `in` operator supports at most 30 values. */
const FIRESTORE_IN_LIMIT = 30;

function chunkIds(ids: readonly string[], size = FIRESTORE_IN_LIMIT): string[][] {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

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

  /** Today + manual extras + upcoming (7-day) race ids for competitor loading. */
  private readonly loadedRaceIds = computed(() => {
    const ids = new Set<string>([
      ...this.selectedRaces.selectedRaceIds(),
      ...this.selectedRaces.upcomingRaceIds(),
    ]);
    return [...ids].sort();
  });

  private readonly loadedRaceIdsKey = computed(() => {
    const ids = this.loadedRaceIds();
    return ids.length === 0 ? '' : ids.join('\0');
  });

  /** Race competitors in selected and upcoming races */
  private readonly selectedCompResource = rxResource<RaceCompetitor[], string>({
    params: () => this.loadedRaceIdsKey(),
    stream: () => {
      const selectedIds = this.loadedRaceIds();
      if (selectedIds.length === 0) {
        return of([]);
      }

      const chunks = chunkIds(selectedIds);
      const streams = chunks.map(chunk =>
        collectionData(query(this.collection, where('raceId', 'in', chunk))),
      );

      const merged$ =
        streams.length === 1
          ? streams[0]
          : combineLatest(streams).pipe(
              map(parts => {
                const byId = new Map<string, RaceCompetitor>();
                for (const part of parts) {
                  for (const competitor of part) {
                    byId.set(competitor.id, competitor);
                  }
                }
                return [...byId.values()];
              }),
            );

      return merged$.pipe(
        tap(rc => console.log(`RaceCompetitorStore. Loaded ${rc.length} competitors`)),
      );
    },
    defaultValue: [],
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
