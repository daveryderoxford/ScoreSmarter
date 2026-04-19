import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { collectionData, docData, orderBy, query } from '@angular/fire/firestore';
import type { Observable } from 'rxjs';
import { catchError, combineLatest, map, of, switchMap, tap, timer } from 'rxjs';

import { FirestoreTenantService } from 'app/club-tenant/services/firestore-tenant';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';

import type { PublishedRace } from '../model/published-race';
import type { SeriesInfo } from '../model/published-season';
import type { PublishedSeries } from '../model/published-series';
import { PUBLISHED_SERIES_PATH, PublishedResultsReader } from './published-results-store';
import { isScheduledToday, uniqueSeriesCandidatesForDay } from './todays-published-races.utils';

export interface TodaysPublishedRaceBlock {
  seriesId: string;
  seriesName: string;
  fleetId: string;
  scoringHandicapScheme: HandicapScheme | undefined;
  race: PublishedRace;
}

/**
 * Live Firestore view of today's published races for the current club.
 *
 * Provided on the Today's results route component only so subscriptions are torn down
 * when leaving the route (no long-lived listeners on a singleton).
 */
@Injectable()
export class TodaysPublishedRacesService {
  private static readonly EMPTY_BLOCKS: TodaysPublishedRaceBlock[] = [];

  private readonly injector = inject(Injector);
  private readonly tenant = inject(FirestoreTenantService);
  private readonly reader = inject(PublishedResultsReader);

  private readonly blocksErrorSignal = signal<unknown>(undefined);

  /**
   * Seasons index + a one-minute tick so we re-evaluate "today" around midnight
   * and when the calendar-day filter should change without a manual refresh.
   */
  private readonly blocks$ = combineLatest([
    toObservable(this.reader.seasons, { injector: this.injector }),
    timer(0, 60_000),
  ]).pipe(
    tap(() => this.blocksErrorSignal.set(undefined)),
    switchMap(([seasons]) => {
      const candidates = uniqueSeriesCandidatesForDay(seasons, new Date());
      if (candidates.length === 0) {
        return of(TodaysPublishedRacesService.EMPTY_BLOCKS);
      }
      return combineLatest(candidates.map(c => this.watchSeriesBlocks(c))).pipe(
        map(parts => this.flattenAndSort(parts)),
      );
    }),
    catchError(err => {
      console.error('TodaysPublishedRacesService: stream failed', err);
      this.blocksErrorSignal.set(err);
      return of(TodaysPublishedRacesService.EMPTY_BLOCKS);
    }),
  );

  readonly blocks = toSignal(this.blocks$, {
    injector: this.injector,
    initialValue: TodaysPublishedRacesService.EMPTY_BLOCKS,
  });

  readonly loadError = computed(() => this.blocksErrorSignal());

  /** True until the published seasons index has first loaded from Firestore. */
  readonly loading = computed(() => this.reader.seasonsLoading());

  private watchSeriesBlocks(info: SeriesInfo): Observable<TodaysPublishedRaceBlock[]> {
    const seriesId = info.id;
    const seriesRef = this.tenant.docRef<PublishedSeries>(PUBLISHED_SERIES_PATH, seriesId);
    const racesQuery = query(
      this.tenant.collectionRef<PublishedRace>(PUBLISHED_SERIES_PATH, seriesId, 'races'),
      orderBy('scheduledStart', 'asc'),
    );
    return combineLatest({
      series: docData(seriesRef),
      races: collectionData(racesQuery),
    }).pipe(
      map(({ series, races }) => {
        if (!series) return [];
        const scheme = series.competitors[0]?.handicapScheme;
        const day = new Date();
        const out: TodaysPublishedRaceBlock[] = [];
        for (const race of races) {
          if (isScheduledToday(race.scheduledStart, day)) {
            out.push({
              seriesId,
              seriesName: series.name,
              fleetId: series.fleetId,
              scoringHandicapScheme: scheme,
              race,
            });
          }
        }
        return out;
      }),
      catchError(err => {
        console.warn(`TodaysPublishedRacesService: series ${seriesId}`, err);
        return of([]);
      }),
    );
  }

  private flattenAndSort(parts: TodaysPublishedRaceBlock[][]): TodaysPublishedRaceBlock[] {
    const flat = parts.flat();
    flat.sort(
      (a, b) =>
        a.race.scheduledStart.getTime() - b.race.scheduledStart.getTime() ||
        a.seriesName.localeCompare(b.seriesName) ||
        a.race.index - b.race.index,
    );
    return flat;
  }
}
