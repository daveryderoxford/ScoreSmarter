import { Injectable, inject, signal, computed, linkedSignal } from '@angular/core';
import { collectionData, docData, query, orderBy, limit, getDoc, getDocs } from '@angular/fire/firestore';
import { of, map } from 'rxjs';
import { PublishedSeason } from '../model/published-season';
import { PublishedSeries } from '../model/published-series';
import { PublishedRace } from '../model/published-race';
import { expandSeriesResult, type StoredPublishedSeries } from '../model/published-series-storage';
import { publishedDivisionDefinitions } from 'app/race-calender/model/division';
import { FirestoreTenantService } from 'app/club-tenant/services/firestore-tenant';
import { firestoreListenerResource } from 'app/shared/firebase/firestore-listener-resource';

/** Restores compact race scores and defaults missing `divisions` / `divisionDefinitions` on read. */
function coercePublishedSeries(series: StoredPublishedSeries | undefined): PublishedSeries | undefined {
  if (!series) return undefined;
  return {
    ...series,
    competitors: series.competitors.map(c => {
      const row = expandSeriesResult(c);
      return { ...row, divisions: Array.isArray(row.divisions) ? row.divisions : [] };
    }),
    divisionDefinitions: publishedDivisionDefinitions(series),
  };
}

function coercePublishedRace(race: PublishedRace): PublishedRace {
  return {
    ...race,
    results: race.results.map(r => ({
      ...r,
      divisions: Array.isArray(r.divisions) ? r.divisions : [],
    })),
    divisionDefinitions: publishedDivisionDefinitions(race),
  };
}

export const PUBLISHED_SEASONS_PATH = 'published_seasons';
export const PUBLISHED_SERIES_PATH = 'published_series';

/** Newest races loaded when a series opens (covers a race day), and how many more each time. */
export const FIRST_RACE_PAGE = 3;
export const NEXT_RACE_PAGE = 6;
/** Query limit that loads every race of a series. */
export const ALL_RACES = 500;

/**
 * Number of newest races to load so that race `raceIndex` is included, given the race
 * numbers in the series (from the standings). Unknown numbers load every race.
 */
export function racesNeededFor(raceIndex: number, seriesRaceIndexes: readonly number[]): number {
  if (!seriesRaceIndexes.includes(raceIndex)) return ALL_RACES;
  return seriesRaceIndexes.filter(i => i >= raceIndex).length;
}

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

   // 2. Selected series (standings) and its races, loaded separately so the standings show first.
   selectedSeriesId = signal<string | undefined>(undefined);

   /** How many of the newest races to load; resets when the series changes. */
   private readonly raceLimit = linkedSignal<string | undefined, number>({
      source: () => this.selectedSeriesId(),
      computation: () => FIRST_RACE_PAGE,
   });

   private readonly _seriesResource = firestoreListenerResource({
      name: 'published-series-detail',
      params: () => this.selectedSeriesId(),
      stream: ({ params: id }) => {
         if (!id) return of(undefined);
         const seriesDocRef = this.tenant.docRef<StoredPublishedSeries>(PUBLISHED_SERIES_PATH, id);
         return docData(seriesDocRef).pipe(map(coercePublishedSeries));
      },
   });

   private readonly _racesResource = firestoreListenerResource({
      name: 'published-series-races',
      params: () => {
         const id = this.selectedSeriesId();
         return id ? { id, count: this.raceLimit() } : undefined;
      },
      stream: ({ params }) => {
         if (!params) return of([] as PublishedRace[]);
         const racesCol = this.tenant.collectionRef<PublishedRace>(PUBLISHED_SERIES_PATH, params.id, 'races');
         return collectionData(query(racesCol, orderBy('index', 'desc'), limit(params.count))).pipe(
            map(races => races.map(coercePublishedRace).reverse()),
         );
      },
      defaultValue: [] as PublishedRace[],
   });

   readonly series = computed(() => this._seriesResource.value());
   readonly seriesLoading = this._seriesResource.isLoading;
   readonly seriesError = computed(() => this._seriesResource.error() ?? this._racesResource.error());

   /**
    * Loaded races in race order (oldest first). While more races load, the ones already
    * shown stay rather than the list emptying.
    */
   readonly races = linkedSignal<{ seriesId?: string; races: PublishedRace[]; loading: boolean }, PublishedRace[]>({
      source: () => ({
         seriesId: this.selectedSeriesId(),
         races: this._racesResource.value(),
         loading: this._racesResource.isLoading(),
      }),
      computation: (src, previous) =>
         src.loading && previous && previous.source.seriesId === src.seriesId ? previous.value : src.races,
   });
   readonly racesLoading = this._racesResource.isLoading;

   /** Race numbers in the series, from the standings (oldest first). */
   readonly seriesRaceIndexes = computed(() =>
      (this.series()?.competitors[0]?.raceScores ?? []).map(s => s.raceIndex),
   );

   readonly hasMoreRaces = computed(() => {
      const loaded = this.races().length;
      const total = this.series()?.racesSailed;
      return total !== undefined ? loaded < total : loaded >= this.raceLimit();
   });

   loadMoreRaces(): void {
      if (this.racesLoading() || !this.hasMoreRaces()) return;
      this.raceLimit.update(n => n + NEXT_RACE_PAGE);
   }

   /** Loads enough of the newest races to include race number `raceIndex`. */
   ensureRaceIndexLoaded(raceIndex: number): void {
      const needed = racesNeededFor(raceIndex, this.seriesRaceIndexes());
      if (needed > this.raceLimit()) this.raceLimit.set(needed);
   }

   /** Loads enough of the newest races to include the race with this id (e.g. from a link). */
   async ensureRaceIdLoaded(raceId: string): Promise<void> {
      const seriesId = this.selectedSeriesId();
      if (!seriesId || this.races().some(r => r.id === raceId)) return;
      const snap = await getDoc(this.tenant.docRef<PublishedRace>(PUBLISHED_SERIES_PATH, seriesId, 'races', raceId));
      if (snap.exists() && this.selectedSeriesId() === seriesId) this.ensureRaceIndexLoaded(snap.data().index);
   }

  // Fallback fetch for a specific series if not in cache
  async getSeriesById(id: string): Promise<PublishedSeries | undefined> {
      // Check if it's the currently loaded series
      const currentSeries = this.series();
      if (currentSeries && currentSeries.id === id) {
         return currentSeries;
      }

      // Fallback to fetching directly from Firestore
      const seriesDocRef = this.tenant.docRef<StoredPublishedSeries>(PUBLISHED_SERIES_PATH, id);
      const snapshot = await getDoc(seriesDocRef);
      return snapshot.exists() ? coercePublishedSeries(snapshot.data()) : undefined;
   }

   /** One-shot fetch of a published series and all its races. Does not change `selectedSeriesId`. */
   async getSeriesWithRaces(id: string): Promise<{ series: PublishedSeries; races: PublishedRace[] } | undefined> {
      const seriesDocRef = this.tenant.docRef<StoredPublishedSeries>(PUBLISHED_SERIES_PATH, id);
      const racesCol = this.tenant.collectionRef<PublishedRace>(PUBLISHED_SERIES_PATH, id, 'races');
      const [seriesSnap, racesSnap] = await Promise.all([
         getDoc(seriesDocRef),
         getDocs(query(racesCol, orderBy('index', 'asc'))),
      ]);
      if (!seriesSnap.exists()) return undefined;

      const series = coercePublishedSeries(seriesSnap.data());
      if (!series) return undefined;
      return {
         series,
         races: racesSnap.docs.map(d => coercePublishedRace(d.data())),
      };
   }
}
