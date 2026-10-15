import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { isBefore, startOfDay } from 'date-fns';
import { RaceCalendarStore } from 'app/race-calender/services/full-race-calander';
import { deleteField } from '@angular/fire/firestore';
import { Race } from 'app/race-calender/model/race';
import { RaceStatus } from 'app/race-calender/model/race-status';
import { RaceDayActions } from 'app/results-input/services/race-day-actions';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-race-status-review',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatDividerModule,
    Toolbar,
    PageLayout,
    RouterModule
  ],
  templateUrl: './race-status-review.html',
  styleUrl: './race-status-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaceStatusReviewComponent {
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  protected readonly raceDayActions = inject(RaceDayActions);

  readonly pastUnverifiedRaces = computed(() => {
    const now = new Date();
    const allRaces = this.raceCalendarStore.allRaces();
    return allRaces.filter((r) => {
      // Past races
      if (!isBefore(r.scheduledStart, now)) return false;
      // Not yet verified or archived
      return r.status !== 'Verified' && r.status !== 'Archived';
    });
  });

  async setStatus(race: Race, status: RaceStatus) {
    try {
      const leavingCancelled = race.status === 'Canceled' && status !== 'Canceled';
      await this.raceCalendarStore.updateRaces([{
        id: race.id,
        data: leavingCancelled ? { status, cancellationReason: deleteField() } : { status },
      }]);
    } catch (e) {
      console.error('Failed to update race status:', e);
    }
  }
}
