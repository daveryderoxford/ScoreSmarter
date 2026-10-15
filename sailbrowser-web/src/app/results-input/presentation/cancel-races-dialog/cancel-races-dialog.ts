import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { racesOnSameDay } from 'app/race-calender/model/races-on-same-day';
import { format } from 'date-fns';
import { RaceCancellationService } from '../../services/race-cancellation.service';

export interface CancelRacesDialogData {
  race: Race;
  /** Pre-select every race on the day. */
  cancelWholeDay?: boolean;
}

export const CANCELLATION_REASONS = ['No wind', 'Too windy', 'Insufficient entries', 'No race officer', 'Bad weather'];

const STATUSES_WITH_RESULTS = new Set<Race['status']>(['In progress', 'Completed', 'Published', 'Verified']);

/** Cancels one or more of a day's races with a reason. Returns true when races were cancelled. */
@Component({
  selector: 'app-cancel-races-dialog',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>Cancel races: {{ dateLabel }}</h2>
    <mat-dialog-content>
      @if (dayRaces().length > 1) {
        <mat-slide-toggle [checked]="allSelected()" (change)="selectAll($event.checked)">
          Cancel all races on this day
        </mat-slide-toggle>
      }
      <ul class="race-list">
        @for (race of dayRaces(); track race.id) {
          <li>
            <mat-checkbox [checked]="selected().has(race.id)" (change)="toggle(race.id, $event.checked)">
              {{ race.seriesName }} race {{ race.index }}
              <span class="race-meta">{{ race.scheduledStart | date: 'HH:mm' }} · {{ race.status }}</span>
            </mat-checkbox>
          </li>
        }
      </ul>
      <mat-form-field class="field">
        <mat-label>Reason</mat-label>
        <input matInput [formControl]="reason" [matAutocomplete]="reasons" autocomplete="off" />
        <mat-autocomplete #reasons="matAutocomplete">
          @for (option of reasonOptions(); track option) {
            <mat-option [value]="option">{{ option }}</mat-option>
          }
        </mat-autocomplete>
        <mat-error>A reason is required</mat-error>
      </mat-form-field>
      @if (selectedWithResults() > 0) {
        <p class="warning" role="status">
          {{ selectedWithResults() === 1 ? 'A selected race has' : selectedWithResults() + ' selected races have' }}
          results. They will be kept but not scored while the race is cancelled.
        </p>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="dialogRef.close(false)" [disabled]="saving()">Back</button>
      <button matButton="filled" type="button" (click)="confirm()" [disabled]="!canConfirm()">
        Cancel {{ selected().size }} {{ selected().size === 1 ? 'race' : 'races' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: 360px;
    }
    .race-list {
      list-style: none;
      margin: 8px 0 12px;
      padding: 0;
    }
    .race-meta {
      margin-left: 0.5rem;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .field {
      width: 100%;
    }
    .warning {
      margin: 0 0 8px;
      font-size: 0.875rem;
      color: #92400e;
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class CancelRacesDialog {
  private readonly data = inject<CancelRacesDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<CancelRacesDialog, boolean>);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly cancellation = inject(RaceCancellationService);

  protected readonly dateLabel = format(this.data.race.scheduledStart, 'EEE d MMM yyyy');

  /** The day's races that are not already cancelled; the given race is always listed. */
  protected readonly dayRaces = computed(() => {
    const races = racesOnSameDay(this.data.race, this.raceCalendar.allRaces())
      .filter(r => r.status !== 'Canceled' || r.id === this.data.race.id);
    return races.some(r => r.id === this.data.race.id) ? races : [this.data.race, ...races];
  });

  protected readonly selected = signal<ReadonlySet<string>>(
    new Set(this.data.cancelWholeDay ? this.dayRaces().map(r => r.id) : [this.data.race.id]),
  );

  protected readonly reason = new FormControl('', { nonNullable: true, validators: Validators.required });
  private readonly reasonValue = toSignal(this.reason.valueChanges, { initialValue: '' });
  protected readonly reasonOptions = computed(() => {
    const term = this.reasonValue().trim().toLowerCase();
    return CANCELLATION_REASONS.filter(r => r.toLowerCase().includes(term));
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly allSelected = computed(() => this.dayRaces().every(r => this.selected().has(r.id)));
  protected readonly selectedRaces = computed(() => this.dayRaces().filter(r => this.selected().has(r.id)));
  protected readonly selectedWithResults = computed(() =>
    this.selectedRaces().filter(r => STATUSES_WITH_RESULTS.has(r.status)).length,
  );
  protected readonly canConfirm = computed(() =>
    !this.saving() && this.selected().size > 0 && !!this.reasonValue().trim(),
  );

  protected toggle(raceId: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(raceId);
    else next.delete(raceId);
    this.selected.set(next);
  }

  protected selectAll(checked: boolean): void {
    this.selected.set(new Set(checked ? this.dayRaces().map(r => r.id) : []));
  }

  protected async confirm(): Promise<void> {
    this.reason.markAsTouched();
    if (!this.canConfirm()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.cancellation.cancelRaces(this.selectedRaces(), this.reason.value);
      this.dialogRef.close(true);
    } catch (e: unknown) {
      console.error('CancelRacesDialog: cancel failed', e);
      this.error.set('Could not cancel the races. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
