import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { racesAwaitingReview } from 'app/race-calender/model/results-review';
import { RaceCalendarStore } from 'app/race-calender/services/full-race-calander';

/** Club admin shortcut to the results review page, badged with the races awaiting review. */
@Component({
  selector: 'app-home-review-results-button',
  imports: [MatBadgeModule, MatButtonModule, MatIconModule, RouterLink],
  template: `
    <a matButton="tonal" routerLink="/club-admin/race-review">
      <mat-icon
        [matBadge]="awaitingCount()"
        [matBadgeHidden]="awaitingCount() === 0"
        matBadgeSize="small"
        [matBadgeDescription]="awaitingCount() + ' races awaiting review'">fact_check</mat-icon>
      <span>Review results</span>
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeReviewResultsButton {
  private readonly raceCalendar = inject(RaceCalendarStore);

  protected readonly awaitingCount = computed(() => racesAwaitingReview(this.raceCalendar.allRaces()).length);
}
