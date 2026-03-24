import { Injectable, inject, signal, computed } from '@angular/core';
import { collectionData, docData, query, orderBy } from '@angular/fire/firestore';
import { rxResource } from '@angular/core/rxjs-interop';
import { of, combineLatest } from 'rxjs';
import { PublishedSeason } from '../model/published-season';
import { PublishedSeries } from '../model/published-series';
import { PublishedRace } from '../model/published-race';
import { FirestoreTenantService } from 'app/club-tenant/services/firestore-tenant';

export const PUBLISHED_SEASONS_PATH = 'published_seasons';
export const PUBLISHED_SERIES_PATH = 'published_series';

@Injectable({ providedIn: 'root' })
export class PublishedResultsReader {
   private readonly tenant = inject(FirestoreTenantService);

   // 1. Seasons Index
   private readonly _seasonsResource = rxResource<PublishedSeason[], void>({
      stream: () => collectionData(this.tenant.collectionRef<PublishedSeason>(PUBLISHED_SEASONS_PATH))
   });
   readonly seasons = computed(() => this._seasonsResource.value() || []);
   readonly seasonsLoading = this._seasonsResource.isLoading;

   // 2. Selected Series and its Races
   selectedSeriesId = signal<string | undefined>(undefined);
   
   private readonly _seriesDataResource = rxResource({
      params: () => this.selectedSeriesId(),
      stream: ({ params: id }) => {
         if (!id) return of({ series: undefined, races: [] });
         
         const seriesDocRef = this.tenant.docRef<PublishedSeries>(PUBLISHED_SERIES_PATH, id);
         const racesCol = this.tenant.collectionRef<PublishedRace>(PUBLISHED_SERIES_PATH, id, 'races');
         const q = query(racesCol, orderBy('index', 'asc'));

         return combineLatest({
            series: docData(seriesDocRef),
            races: collectionData(q)
         });
      }
   });

   readonly series = computed(() => this._seriesDataResource.value()?.series);
   readonly races = computed(() => this._seriesDataResource.value()?.races || []);
   readonly seriesLoading = this._seriesDataResource.isLoading;
   readonly seriesError = this._seriesDataResource.error;
}
