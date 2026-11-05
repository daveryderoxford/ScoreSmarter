import { computed, inject, Injectable, signal } from '@angular/core';
import { collectionData, query, where } from '@angular/fire/firestore';
import { FirestoreTenantService } from 'app/club-tenant/services/firestore-tenant';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { sortEntries } from 'app/results-input/services/series-entry-store';
import { collectionDataInChunks } from 'app/shared/firebase/firestore-in-query';
import { firestoreListenerResource } from 'app/shared/firebase/firestore-listener-resource';
import { map } from 'rxjs';

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
    stream: () =>
      collectionDataInChunks(this.seriesIds(), chunk =>
        collectionData(query(this.collection, where('seriesId', 'in', chunk)), { idField: 'id' }),
      ).pipe(map(entries => [...entries].sort(sortEntries))),
    defaultValue: [] as SeriesEntry[],
  });

  readonly entries = this.resource.value.asReadonly();
  readonly loading = this.resource.isLoading;
}
