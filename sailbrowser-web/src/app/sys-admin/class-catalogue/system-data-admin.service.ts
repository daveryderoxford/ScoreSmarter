import { inject, Injectable } from '@angular/core';
import { addDoc, collection, deleteDoc, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import {
  CLASS_CATALOGUE_PATH,
  RATING_LISTS_PATH,
  RatingListStore,
  type ClassCatalogue,
  type RatingList,
} from 'app/system-data';

/** Writes to the global system data. Sys-admin only (enforced by Firestore rules). */
@Injectable({ providedIn: 'root' })
export class SystemDataAdminService {
  private readonly firestore = inject(Firestore);
  private readonly ratingLists = inject(RatingListStore);

  async saveCatalogue(catalogue: ClassCatalogue): Promise<void> {
    const ref = doc(this.firestore, ...CLASS_CATALOGUE_PATH).withConverter(dataObjectConverter<ClassCatalogue>());
    await firestoreWrite(setDoc(ref, { ...catalogue, updatedAt: new Date() }), 'Saving class catalogue');
  }

  async addRatingList(list: Omit<RatingList, 'id'>): Promise<void> {
    await firestoreWrite(addDoc(this.ratingListsRef(), list as RatingList), 'Saving rating list');
    await this.ratingLists.refresh();
  }

  async removeRatingList(id: string): Promise<void> {
    await firestoreWrite(deleteDoc(doc(this.ratingListsRef(), id)), 'Deleting rating list');
    await this.ratingLists.refresh();
  }

  private ratingListsRef() {
    return collection(this.firestore, ...RATING_LISTS_PATH).withConverter(dataObjectConverter<RatingList>());
  }
}
