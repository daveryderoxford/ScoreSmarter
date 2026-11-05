import { combineLatest, map, Observable, of } from 'rxjs';

/** Firestore `in` operator supports at most 30 values. */
const FIRESTORE_IN_LIMIT = 30;

/**
 * Runs `load` once per group of at most 30 values and merges the live results by document id.
 * Emits `[]` when `values` is empty.
 */
export function collectionDataInChunks<T extends { id: string }>(
  values: readonly string[],
  load: (chunk: string[]) => Observable<T[]>,
): Observable<T[]> {
  if (values.length === 0) return of([]);

  const streams: Observable<T[]>[] = [];
  for (let i = 0; i < values.length; i += FIRESTORE_IN_LIMIT) {
    streams.push(load(values.slice(i, i + FIRESTORE_IN_LIMIT)));
  }
  if (streams.length === 1) return streams[0];

  return combineLatest(streams).pipe(
    map(parts => {
      const byId = new Map<string, T>();
      for (const part of parts) {
        for (const doc of part) byId.set(doc.id, doc);
      }
      return [...byId.values()];
    }),
  );
}
