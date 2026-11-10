import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ClubStore } from 'app/club-tenant/services/club-store';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { DetailPane } from 'app/shared/layout/detail-pane';
import { ListDetailLayout } from 'app/shared/layout/list-detail-layout';
import { listDetailRoute } from 'app/shared/layout/list-detail-route';
import { ListPane } from 'app/shared/layout/list-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { eventsBySeason, seriesForEvent } from '../model/open-event';
import { EventStore } from '../services/event-store';

/** Club admin: open meetings by season, with the add or edit form beside the list. */
@Component({
  selector: 'app-event-manage-page',
  imports: [
    PageLayout, Toolbar, ListDetailLayout, ListPane, DetailPane, RouterOutlet,
    MatListModule, MatDividerModule, MatButtonModule, RouterLink, DatePipe, LoadingCentered,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout>
      <app-toolbar [title]="toolbarTitle()" [showBack]="showBack()" />
      <app-list-detail-layout [detailOpen]="detailOpen()" detailWidth="470px">
        <app-list-pane list>
          <div listHeader class="header">
            <a matButton="tonal" routerLink="add">New event</a>
          </div>
          @if (store.loading()) {
            <app-loading-centered />
          } @else {
            <mat-list class="dense-list">
              @for (group of groups(); track group.season.id) {
                <div mat-subheader>{{ group.season.name }}</div>
                @for (event of group.events; track event.id) {
                  <mat-list-item [routerLink]="['edit', event.id]" [activated]="selectedEventId() === event.id">
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

        <app-detail-pane detail maxWidth="430px" fillHeight>
          <router-outlet />
        </app-detail-pane>
      </app-list-detail-layout>
    </app-page-layout>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }
    .header { display: flex; justify-content: flex-end; margin: 12px; }
  `,
})
export class EventManagePage {
  protected readonly store = inject(EventStore);
  private readonly club = inject(ClubStore);
  private readonly calendar = inject(RaceCalendarStore);
  private readonly detail = listDetailRoute();

  readonly detailOpen = this.detail.detailOpen;
  readonly selectedEventId = this.detail.selectedId;
  readonly showBack = this.detail.showBack;
  readonly toolbarTitle = computed(() => {
    if (this.detail.isSplit()) return 'Open events';
    const child = this.detail.selection();
    if (child?.kind === 'add') return 'New event';
    if (child?.kind === 'edit') return this.store.events().find(e => e.id === child.id)?.name ?? 'Event';
    return 'Open events';
  });

  readonly groups = computed(() => eventsBySeason(this.store.events(), this.club.club().seasons));

  seriesCount(eventId: string): number {
    return seriesForEvent(eventId, this.calendar.allSeries()).length;
  }
}
