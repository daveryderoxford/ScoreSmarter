import { computed, Injectable, inject, linkedSignal } from '@angular/core';

import type { RaceCompetitor } from '../model/race-competitor';
import {
  ResolvedRaceCompetitor,
  resolveRaceCompetitors,
} from '../model/resolved-race-competitor';

import type { SeriesEntry } from '../model/series-entry';
import { RaceCompetitorStore } from './race-competitor-store';
import { SeriesEntryStore } from './series-entry-store';

interface ResolveRaceCompetitorsInput {
  competitors: RaceCompetitor[];
  entries: SeriesEntry[];
  loading: boolean;
}

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

  private readonly resolveInput = computed((): ResolveRaceCompetitorsInput => ({
    competitors: this.raceCompetitors.selectedCompetitors(),
    entries: this.seriesEntries.selectedEntries(),
    loading: this.loading(),
  }));

  /** Keeps the previous join while Firestore resources reload to avoid false orphan warnings. */
  readonly selectedResolvedCompetitors = linkedSignal<
    ResolveRaceCompetitorsInput,
    ResolvedRaceCompetitor[]
  >({
    source: this.resolveInput,
    computation: (input, previous) => {
      if (input.loading) {
        return previous?.value ?? [];
      }
      return resolveRaceCompetitors(input.competitors, input.entries);
    },
  });

  resolvedForRace(raceId: string): ResolvedRaceCompetitor[] {
    return this.selectedResolvedCompetitors().filter(c => c.raceId === raceId);
  }

  resolvedForSeries(seriesId: string): ResolvedRaceCompetitor[] {
    return this.selectedResolvedCompetitors().filter(c => c.seriesId === seriesId);
  }

}
