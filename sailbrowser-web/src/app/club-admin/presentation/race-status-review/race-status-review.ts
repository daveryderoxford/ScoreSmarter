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
import { Race } from 'app/race-calender/model/race';
import { Toolbar } from 'app/shared/components/toolbar';
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
    RouterModule
  ],
  templateUrl: './race-status-review.html',
  styleUrl: './race-status-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaceStatusReviewComponent {
  private readonly raceCalendarStore = inject(RaceCalendarStore);

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

  async setStatus(race: Race, status: string) {
    if (!status) return;
    try {
      await this.raceCalendarStore.updateRace(race.id, { status: status as any });
    } catch (e) {
      console.error('Failed to update race status:', e);
    }
  }
}
