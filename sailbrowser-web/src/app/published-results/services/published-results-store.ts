import { Injectable, inject, signal, computed } from '@angular/core';
import { collectionData, docData, query, orderBy, getDoc } from '@angular/fire/firestore';
import { of, combineLatest, map } from 'rxjs';
import { PublishedSeason } from '../model/published-season';
import { PublishedSeries } from '../model/published-series';
import { PublishedRace } from '../model/published-race';
import { FirestoreTenantService } from 'app/club-tenant/services/firestore-tenant';
import { firestoreListenerResource } from 'app/shared/firebase/firestore-listener-resource';

/** Defaults the mandatory tags / tagDefinitions arrays for older docs read off the wire. */
function coercePublishedSeries(series: PublishedSeries | undefined): PublishedSeries | undefined {
  if (!series) return series;
  return {
    ...series,
    competitors: series.competitors.map(c =>
      Array.isArray(c.tags) ? c : { ...c, tags: [] },
    ),
    tagDefinitions: Array.isArray(series.tagDefinitions) ? series.tagDefinitions : [],
  };
}

function coercePublishedRace(race: PublishedRace): PublishedRace {
  return {
    ...race,
    results: race.results.map(r =>
      Array.isArray(r.tags) ? r : { ...r, tags: [] },
    ),
    tagDefinitions: Array.isArray(race.tagDefinitions) ? race.tagDefinitions : [],
  };
}

export const PUBLISHED_SEASONS_PATH = 'published_seasons';
export const PUBLISHED_SERIES_PATH = 'published_series';

@Injectable({ providedIn: 'root' })
export class PublishedResultsReader {
   private readonly tenant = inject(FirestoreTenantService);

   // 1. Seasons Index
   private readonly _seasonsResource = firestoreListenerResource({
      name: 'published-seasons',
      stream: () => collectionData(this.tenant.collectionRef<PublishedSeason>(PUBLISHED_SEASONS_PATH)),
      defaultValue: [] as PublishedSeason[],
   });
   readonly seasons = computed(() => this._seasonsResource.value() || []);
   readonly seasonsLoading = this._seasonsResource.isLoading;
   readonly seasonsError = this._seasonsResource.error;

   // 2. Selected Series and its Races
   selectedSeriesId = signal<string | undefined>(undefined);
   
   private readonly _seriesDataResource = firestoreListenerResource({
      name: 'published-series-detail',
      params: () => this.selectedSeriesId(),
      stream: ({ params: id }) => {
         if (!id) return of({ series: undefined as PublishedSeries | undefined, races: [] as PublishedRace[] });
         
         const seriesDocRef = this.tenant.docRef<PublishedSeries>(PUBLISHED_SERIES_PATH, id);
         const racesCol = this.tenant.collectionRef<PublishedRace>(PUBLISHED_SERIES_PATH, id, 'races');
         const q = query(racesCol, orderBy('index', 'asc'));

         return combineLatest({
            series: docData(seriesDocRef).pipe(map(coercePublishedSeries)),
            races: collectionData(q).pipe(map(races => races.map(coercePublishedRace)))
         });
      }
   });

   readonly series = computed(() => this._seriesDataResource.value()?.series);
   readonly races = computed(() => this._seriesDataResource.value()?.races || []);
   readonly seriesLoading = this._seriesDataResource.isLoading;
   readonly seriesError = this._seriesDataResource.error;

   // Fallback fetch for a specific series if not in cache
   async getSeriesById(id: string): Promise<PublishedSeries | undefined> {
      // Check if it's the currently loaded series
      const currentSeries = this.series();
      if (currentSeries && currentSeries.id === id) {
         return currentSeries;
      }

      // Fallback to fetching directly from Firestore
      const seriesDocRef = this.tenant.docRef<PublishedSeries>(PUBLISHED_SERIES_PATH, id);
      const snapshot = await getDoc(seriesDocRef);
      return snapshot.exists() ? coercePublishedSeries(snapshot.data()) : undefined;
   }
}
