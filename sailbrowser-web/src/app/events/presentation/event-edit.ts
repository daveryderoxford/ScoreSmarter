import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import { DeleteButton } from 'app/shared/components/delete-button';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { DetailPane } from 'app/shared/layout/detail-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { seriesForEvent } from '../model/open-event';
import { EventSetupService } from '../services/event-setup.service';
import { EventStore } from '../services/event-store';
import { EventForm, type EventFormValue } from './event-form';

@Component({
  selector: 'app-event-edit',
  imports: [PageLayout, Toolbar, DetailPane, EventForm, DeleteButton, LoadingCentered, MatButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout>
      <app-toolbar [title]="event()?.name ?? 'Event'" showBack />
      <app-detail-pane maxWidth="430px">
        @let ev = event();
        @if (ev && !calendar.isLoading()) {
          <app-event-form [event]="ev" [linkedSeriesIds]="linkedSeriesIds()" [busy]="busy()" (save)="save($event)" />
          <div class="actions">
            <a matButton="outlined" [routerLink]="['/events', ev.id]">Event page</a>
            <app-delete-button [busy]="busy()" (delete)="remove()">Delete event</app-delete-button>
          </div>
        } @else if (store.loading() || calendar.isLoading()) {
          <app-loading-centered />
        } @else {
          <p>Event not found.</p>
        }
      </app-detail-pane>
    </app-page-layout>
  `,
  styles: `
    .actions { display: flex; justify-content: space-between; margin-top: 24px; }
  `,
})
export class EventEdit {
  readonly id = input.required<string>();

  protected readonly store = inject(EventStore);
  protected readonly calendar = inject(RaceCalendarStore);
  private readonly setup = inject(EventSetupService);
  private readonly dialogs = inject(DialogsService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly form = viewChild(EventForm);

  readonly event = this.store.event(this.id);
  readonly linkedSeriesIds = computed(() => seriesForEvent(this.id(), this.calendar.allSeries()).map(s => s.id));
  readonly busy = signal(false);

  async save(value: EventFormValue): Promise<void> {
    this.busy.set(true);
    try {
      const { name, startDate, endDate, noticeOfRaceUrl, sailingInstructionsUrl } = value.event;
      await this.store.updateEvent(this.id(), { name, startDate, endDate, noticeOfRaceUrl, sailingInstructionsUrl });
      await this.setup.setEventSeries(this.id(), value.seriesIds);
      this.snackbar.open('Event saved', 'Dismiss', { duration: 3000 });
    } catch (error: unknown) {
      console.error('EventEdit: saving event failed', error);
      this.snackbar.open('Error saving event', 'Dismiss', { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    const ok = await this.dialogs.confirm(
      'Delete event?',
      'The event page is removed. Its series, races and entries stay on the race calendar.',
      { confirm: 'Delete' },
    );
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.setup.deleteEvent(this.id());
      await this.router.navigate(['/events/manage']);
    } catch (error: unknown) {
      console.error('EventEdit: deleting event failed', error);
      this.snackbar.open('Error deleting event', 'Dismiss', { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate = () => this.form()?.canDeactivate() ?? true;
}
