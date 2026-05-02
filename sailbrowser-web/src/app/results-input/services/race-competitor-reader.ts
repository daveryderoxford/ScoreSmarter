import { computed, Injectable, inject } from '@angular/core';

import type { RaceCompetitor } from '../model/race-competitor';
import {
  ResolvedRaceCompetitor,
  resolveRaceCompetitors,
} from '../model/resolved-race-competitor';

import { RaceCompetitorStore } from './race-competitor-store';
import { SeriesEntryStore } from './series-entry-store';

/**
 * Read-side facade for RaceCompetitor + SeriesEntry under the current ClubTenant
 * and {@link CurrentRaces} selection. Centralises the join (`resolveRaceCompetitors`),
 * derived loading flags, and small capability helpers shared by listings and flows.
 */
@Injectable({ providedIn: 'root' })
export class RaceCompetitorReader {
  private readonly raceCompetitors = inject(RaceCompetitorStore);
  private readonly seriesEntries = inject(SeriesEntryStore);

  readonly competitorLoading = this.raceCompetitors.loading;
  readonly entryLoading = this.seriesEntries.loading;
  readonly loading = computed(() => this.competitorLoading() || this.entryLoading());

  readonly selectedResolvedCompetitors = computed(() =>
    resolveRaceCompetitors(
      this.raceCompetitors.selectedCompetitors(),
      this.seriesEntries.selectedEntries(),
    ),
  );

  resolvedForRace(raceId: string): ResolvedRaceCompetitor[] {
    return this.selectedResolvedCompetitors().filter(c => c.raceId === raceId);
  }

  resolvedForSeries(seriesId: string): ResolvedRaceCompetitor[] {
    return this.selectedResolvedCompetitors().filter(c => c.seriesId === seriesId);
  }

}
