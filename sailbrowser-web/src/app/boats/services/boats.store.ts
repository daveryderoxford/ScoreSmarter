import { inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { collectionData, deleteDoc, updateDoc, setDoc } from '@angular/fire/firestore';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { normaliseString } from 'app/shared/utils/string-utils';
import { map, Observable } from 'rxjs';
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
        map(boats => boats.sort(boatsSort)),
    ),
    defaultValue: [],
  });

  trimStrings(boat: Partial<Boat>) {
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

    return update
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

  async update(id: string, data: Partial<Boat>): Promise<void> {
    const docRef = this.ref(id);
    const update = this.trimStrings(data);
    await updateDoc(docRef, update);
  }

  async delete(id: string): Promise<void> {
    const docRef = this.ref(id);
    await deleteDoc(docRef);
  }
}

/** Sort boats by sail number then class */
export function boatsSort(a: Boat, b: Boat): number {
  const ca = normaliseString(a.boatClass);
  const cb = normaliseString(b.boatClass);

  if (ca != cb) {
    return ca.localeCompare(cb);
  } else {
    return a.sailNumber < b.sailNumber ? -1 : 1;
  }
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
    boat.sailNumber.toString().includes(filter) ||
    normaliseString(boat.boatClass).includes(filter) ||
    (boat.isClub && 'club'.includes(filter));
}
