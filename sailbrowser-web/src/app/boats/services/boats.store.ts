import { computed, inject, Injectable } from '@angular/core';
import { collectionData, deleteDoc, setDoc } from '@angular/fire/firestore';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { firestoreListenerResource } from 'app/shared/firebase/firestore-listener-resource';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { normaliseString } from 'app/shared/utils/string-utils';
import { map } from 'rxjs';
import { compareSailNumbers, normalizeSailNumber, sailNumberMatchesSearch } from '../model/sail-number';
import { Boat } from '../model/boat';
import { FirestoreTenantService } from 'app/club-tenant';

@Injectable({
  providedIn: 'root',
})
export class BoatsStore {
  private readonly tenant = inject(FirestoreTenantService);

  private ref = (id:string) => this.tenant.docRef<Boat>( 'boats', id);
  private boatsCollection = this.tenant.collectionRef<Boat>('boats');

  private readonly boatsResource = firestoreListenerResource({
    name: 'boats',
    stream: () =>
      collectionData(this.boatsCollection, { idField: 'id' }).pipe(
        map(boats => boats.map(ensureBoatTags).sort(boatsSort)),
      ),
    defaultValue: [],
  });

  trimStrings(boat: Partial<Boat>): Partial<Boat> {
    const update = { ...boat };
    if (update.helm) {
      update.helm = update.helm.trim();
    }
    if (update.crew) {
      update.crew = update.crew.trim();
    }
    if (update.boatClass) {
      update.boatClass = update.boatClass.trim();
    }
    if (update.name) {
      update.name = update.name.trim();
    }
    if (update.sailNumber != null) {
      update.sailNumber = normalizeSailNumber(update.sailNumber);
    }
    return update;
  }

  /** Collection of all boats */
  readonly boats = this.boatsResource.value.asReadonly();

  /** Distinct helm names from all boats, sorted alphabetically. */
  readonly uniqueHelmNames = computed(() => uniqueHelmNamesFromBoats(this.boats()));
  readonly isLoading = this.boatsResource.isLoading;
  readonly error = this.boatsResource.error;

  async add(boat: Partial<Boat>): Promise<void> {
    const update = this.trimStrings(boat);
    const id = generateSecureID(1000, `B-${update.boatClass}-${update.sailNumber}`);
    await firestoreWrite(setDoc(this.ref(id), update), 'Saving boat');
  }

  /**
   * Partial update of a boat. Uses `setDoc({ merge: true })` rather than
   * `updateDoc` so the typed converter is invoked and `undefined` is omitted
   * (vs the SDK rejecting it with `invalid-argument`). See
   * `firestore-helper.ts` for the partial-write contract.
   */
  async update(id: string, data: Partial<Boat>): Promise<void> {
    const docRef = this.ref(id);
    const update = this.trimStrings(data);
    await firestoreWrite(setDoc(docRef, update, { merge: true }), 'Updating boat');
  }

  async delete(id: string): Promise<void> {
    const docRef = this.ref(id);
    await firestoreWrite(deleteDoc(docRef), 'Deleting boat');
  }
}

/** Ensures missing tags default to an empty array. */
function ensureBoatTags(boat: Boat): Boat {
  if (Array.isArray(boat.tags)) return boat;
  return { ...boat, tags: [] };
}

/** Sort boats by sail number then class */
export function boatsSort(a: Boat, b: Boat): number {
  const ca = normaliseString(a.boatClass);
  const cb = normaliseString(b.boatClass);

  if (ca != cb) {
    return ca.localeCompare(cb);
  }
  return compareSailNumbers(a.sailNumber, b.sailNumber);
}

/** Returns if a boat matches a filter string.
 * Case insensitive 
 */
export function boatFilter(boat: Boat, search: string | null): boolean {

  const filter = normaliseString(search);

  return !filter || filter === '' ||
    normaliseString(boat.name).includes(filter) ||
    normaliseString(boat.helm).includes(filter) ||
    normaliseString(boat.crew).includes(filter) ||
    sailNumberMatchesSearch(boat.sailNumber, filter) ||
    normaliseString(boat.boatClass).includes(filter) ||
    (boat.isClub && 'club'.includes(filter));
}

export function uniqueHelmNamesFromBoats(boats: readonly Boat[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const boat of boats) {
    const trimmed = boat.helm?.trim();
    const key = normaliseString(trimmed);
    if (key !== '') {
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(trimmed);
    }
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

