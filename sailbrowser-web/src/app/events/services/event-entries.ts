import { computed, inject, Injectable, signal } from '@angular/core';
import { collectionData, query, where } from '@angular/fire/firestore';
import { FirestoreTenantService } from 'app/club-tenant/services/firestore-tenant';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { sortEntries } from 'app/results-input/services/series-entry-store';
import { firestoreListenerResource } from 'app/shared/firebase/firestore-listener-resource';
import { combineLatest, map, of } from 'rxjs';

/** Firestore `in` queries take at most 30 values. */
const IN_LIMIT = 30;

/** Live series entries for an event's series. Provide on the page that shows them. */
@Injectable()
export class EventEntries {
  private readonly tenant = inject(FirestoreTenantService);
  private readonly collection = this.tenant.collectionRef<SeriesEntry>('series-entries');

  readonly seriesIds = signal<readonly string[]>([]);
  private readonly key = computed(() => [...this.seriesIds()].sort().join('\0'));

  private readonly resource = firestoreListenerResource({
    name: 'event-entries',
    params: () => this.key(),
    stream: () => {
      const ids = [...this.seriesIds()];
      if (ids.length === 0) return of([] as SeriesEntry[]);
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += IN_LIMIT) chunks.push(ids.slice(i, i + IN_LIMIT));
      return combineLatest(
        chunks.map(chunk => collectionData(query(this.collection, where('seriesId', 'in', chunk)), { idField: 'id' })),
      ).pipe(map(parts => parts.flat().sort(sortEntries)));
    },
    defaultValue: [] as SeriesEntry[],
  });

  readonly entries = this.resource.value.asReadonly();
  readonly loading = this.resource.isLoading;
}
