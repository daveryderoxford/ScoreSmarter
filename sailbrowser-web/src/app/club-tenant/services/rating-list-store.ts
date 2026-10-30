import { inject, Injectable, signal } from '@angular/core';
import { addDoc, collection, deleteDoc, doc, Firestore, getDocs } from '@angular/fire/firestore';
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';
import { firestoreWrite } from 'app/shared/utils/with-timeout';
import { RATING_LISTS_PATH, type RatingList } from '../model/rating-list';

/**
 * Published rating lists (e.g. yearly RYA PY lists), read once per session. Code that
 * resolves entry handicaps awaits `load()` so entries always use the published ratings.
 */
@Injectable({ providedIn: 'root' })
export class RatingListStore {
  private readonly firestore = inject(Firestore);
  private loading?: Promise<RatingList[]>;
  private readonly _lists = signal<RatingList[]>([]);

  /** The lists once loaded (empty until then); call `preload()` or `load()` to start loading. */
  readonly lists = this._lists.asReadonly();

  private ref() {
    return collection(this.firestore, ...RATING_LISTS_PATH).withConverter(dataObjectConverter<RatingList>());
  }

  load(): Promise<RatingList[]> {
    this.loading ??= getDocs(this.ref()).then(
      snap => {
        const lists = snap.docs.map(d => d.data());
        this._lists.set(lists);
        return lists;
      },
      (error: unknown) => {
        this.loading = undefined;
        throw error;
      },
    );
    return this.loading;
  }

  /** Starts loading for display; failures are logged, and `load()` retries. */
  preload(): void {
    this.load().catch((error: unknown) => console.error('Loading rating lists failed', error));
  }

  /** Sys-admin only (enforced by Firestore rules). */
  async add(list: Omit<RatingList, 'id'>): Promise<void> {
    await firestoreWrite(addDoc(this.ref(), list as RatingList), 'Saving rating list');
    await this.reload();
  }

  /** Sys-admin only (enforced by Firestore rules). */
  async remove(id: string): Promise<void> {
    await firestoreWrite(deleteDoc(doc(this.ref(), id)), 'Deleting rating list');
    await this.reload();
  }

  private reload(): Promise<RatingList[]> {
    this.loading = undefined;
    return this.load();
  }
}
