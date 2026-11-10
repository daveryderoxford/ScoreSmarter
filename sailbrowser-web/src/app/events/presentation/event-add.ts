import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DetailHeading } from 'app/shared/layout/detail-heading';
import { EventSetupService } from '../services/event-setup.service';
import { EventForm, type EventFormValue } from './event-form';

/** Detail fragment inside `EventManagePage`. Do not wrap in `PageLayout`. */
@Component({
  selector: 'app-event-add',
  imports: [DetailHeading, EventForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-detail-heading>New event</app-detail-heading>
    <app-event-form [busy]="busy()" (save)="create($event)" />
  `,
})
export class EventAdd {
  private readonly setup = inject(EventSetupService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly form = viewChild.required(EventForm);

  readonly busy = signal(false);

  async create(value: EventFormValue): Promise<void> {
    this.busy.set(true);
    try {
      const id = await this.setup.createEvent(value);
      await this.router.navigate(['/events', id]);
    } catch (error: unknown) {
      console.error('EventAdd: creating event failed', error);
      this.snackbar.open('Error creating event', 'Dismiss', { duration: 4000 });
    } finally {
      this.busy.set(false);
    }
  }

  canDeactivate = () => this.form().canDeactivate();
}
