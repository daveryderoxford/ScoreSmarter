import { inject, Injectable, signal } from '@angular/core';
import { collection, Firestore, getDocs } from '@angular/fire/firestore';
import { dataObjectConverter } from 'app/shared/firebase/firestore-helper';
import { RATING_LISTS_PATH, type RatingList } from '../model/rating-list';

/**
 * Published rating lists (e.g. yearly RYA PY lists), read once per session. Code that
 * resolves entry handicaps awaits `load()` so entries always use the published ratings.
 * Written only by sys-admin.
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

  /** Discards the cached lists and loads them again. */
  refresh(): Promise<RatingList[]> {
    this.loading = undefined;
    return this.load();
  }
}
