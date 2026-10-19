import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  canMarkFinal,
  hasResults,
  racesAwaitingReview,
  resultsStateOf,
  sortRaces,
  type ResultsState,
} from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { StatusPill } from 'app/race-calender/presentation/status-pill/status-pill';
import { RaceCalendarStore } from 'app/race-calender/services/full-race-calander';
import { RaceDayActions } from 'app/results-input/services/race-day-actions';
import { ResultsStateService } from 'app/results-input/services/results-state.service';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';

/** Club admin review of past race results: mark final or provisional, cancel or reinstate. */
@Component({
  selector: 'app-race-status-review',
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    RouterLink,
    StatusPill,
    Toolbar,
    PageLayout,
  ],
  templateUrl: './race-status-review.html',
  styleUrl: './race-status-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaceStatusReviewComponent {
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly resultsStateService = inject(ResultsStateService);
  private readonly snackbar = inject(MatSnackBar);
  protected readonly raceDayActions = inject(RaceDayActions);

  protected readonly canMarkFinal = canMarkFinal;
  protected readonly hasResults = hasResults;
  protected readonly resultsStateOf = resultsStateOf;

  /** Also list final and cancelled past races, so they can be returned to provisional or reinstated. */
  readonly showAll = signal(false);
  /** Race whose results state is being saved. */
  readonly busyRaceId = signal<string | null>(null);

  readonly awaitingReview = computed(() => racesAwaitingReview(this.raceCalendarStore.allRaces()));
  readonly noResultsCount = computed(() => this.awaitingReview().filter(r => r.status === 'Future').length);
  readonly provisionalCount = computed(() => this.awaitingReview().filter(r => hasResults(r)).length);

  readonly races = computed(() => {
    const now = new Date();
    const races = this.showAll()
      ? this.raceCalendarStore.allRaces().filter(r => r.scheduledStart < now)
      : this.awaitingReview();
    return [...races].sort(sortRaces).reverse();
  });

  async setResultsState(race: Race, state: ResultsState): Promise<void> {
    if (resultsStateOf(race) === state) return;
    this.busyRaceId.set(race.id);
    try {
      await this.resultsStateService.setResultsState(race, state);
    } catch (e: unknown) {
      console.error('RaceStatusReview: failed to update results state', e);
      const message = e instanceof Error ? e.message : 'Could not update the results state.';
      this.snackbar.open(message, 'Dismiss', { duration: 5000 });
    } finally {
      this.busyRaceId.set(null);
    }
  }
}
