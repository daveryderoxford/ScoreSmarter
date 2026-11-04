import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { ClubStore } from 'app/club-tenant/services/club-store';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { ListPane } from 'app/shared/layout/list-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { eventsBySeason, seriesForEvent } from '../model/open-event';
import { EventStore } from '../services/event-store';

/** Club admin: open meetings by season, with New. */
@Component({
  selector: 'app-event-manage-list',
  imports: [PageLayout, Toolbar, ListPane, MatListModule, MatDividerModule, MatButtonModule, RouterLink, DatePipe, LoadingCentered],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout>
      <app-toolbar title="Open events" showBack />
      <app-list-pane maxWidth="480px">
        <div listHeader class="header">
          <a matButton="tonal" routerLink="/events/manage/add">New event</a>
        </div>
        @if (store.loading()) {
          <app-loading-centered />
        } @else {
          <mat-list class="dense-list">
            @for (group of groups(); track group.season.id) {
              <div mat-subheader>{{ group.season.name }}</div>
              @for (event of group.events; track event.id) {
                <mat-list-item [routerLink]="['/events/manage/edit', event.id]">
                  <span matListItemTitle>{{ event.name }}</span>
                  <span matListItemLine>
                    {{ event.startDate | date: 'd MMM' }} – {{ event.endDate | date: 'd MMM y' }}
                    · {{ seriesCount(event.id) }} series
                  </span>
                </mat-list-item>
                <mat-divider />
              }
            } @empty {
              <mat-list-item><span matListItemTitle>No events yet</span></mat-list-item>
            }
          </mat-list>
        }
      </app-list-pane>
    </app-page-layout>
  `,
  styles: `
    .header { display: flex; justify-content: flex-end; margin: 12px; }
  `,
})
export class EventManageList {
  protected readonly store = inject(EventStore);
  private readonly club = inject(ClubStore);
  private readonly calendar = inject(RaceCalendarStore);

  readonly groups = computed(() => eventsBySeason(this.store.events(), this.club.club().seasons));

  seriesCount(eventId: string): number {
    return seriesForEvent(eventId, this.calendar.allSeries()).length;
  }
}
