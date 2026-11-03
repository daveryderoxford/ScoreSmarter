import { signal, type Provider } from '@angular/core';
import type { RatingList } from '../model/rating-list';
import { RatingListStore } from './rating-list-store';

/** Test provider for `RatingListStore` holding `lists`, without Firestore. */
export function provideFakeRatingLists(lists: RatingList[] = []): Provider {
  return {
    provide: RatingListStore,
    useValue: {
      lists: signal(lists).asReadonly(),
      load: () => Promise.resolve(lists),
      preload: () => undefined,
    } satisfies Pick<RatingListStore, 'lists' | 'load' | 'preload'>,
  };
}
