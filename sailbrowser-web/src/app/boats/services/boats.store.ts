import { inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { collectionData, deleteDoc, setDoc } from '@angular/fire/firestore';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { normaliseString } from 'app/shared/utils/string-utils';
import { map, Observable } from 'rxjs';
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

  private readonly boatsResource = rxResource<Boat[], null>({
    stream: (): Observable<Boat[]> =>
      collectionData(this.boatsCollection, { idField: 'id' }).pipe(
        map(boats => boats.map(coerceBoat).sort(boatsSort)),
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
  readonly isLoading = this.boatsResource.isLoading;
  readonly error = this.boatsResource.error;

  async add(boat: Partial<Boat>): Promise<void> {
    const update = this.trimStrings(boat);
    const id = generateSecureID(1000, `B-${update.boatClass}-${update.sailNumber}`);
    await setDoc(this.ref(id), update);
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
    await setDoc(docRef, update, { merge: true });
  }

  async delete(id: string): Promise<void> {
    const docRef = this.ref(id);
    await deleteDoc(docRef);
  }
}

/** Normalises wire data (legacy numeric sail numbers, missing tags). */
function coerceBoat(boat: Boat): Boat {
  const coerced: Boat = {
    ...boat,
    sailNumber: normalizeSailNumber(boat.sailNumber),
  };
  if (Array.isArray(boat.tags)) return coerced;
  return { ...coerced, tags: [] };
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
