import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DutiesService, dutyRaceOfficer } from 'app/duties';
import { raceDayDateId } from 'app/duties/services/duties.service';
import { ScoringEngine } from 'app/published-results/services/scoring-engine';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { racesOnSameDay } from 'app/race-calender/model/races-on-same-day';
import { format } from 'date-fns';

export interface RaceDayDetailsDialogData {
  race: Race;
}

const PUBLISHED_STATUSES = new Set<Race['status']>(['In progress', 'Completed']);

/** Sets the race officer and wind for every race on the given race's day. Returns true when saved. */
@Component({
  selector: 'app-race-day-details-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Race day: {{ dateLabel }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="details-form" (ngSubmit)="save()">
        <mat-form-field class="field">
          <mat-label>Race officer</mat-label>
          <input matInput formControlName="raceOfficer" autocomplete="off" />
        </mat-form-field>
        <mat-form-field class="field">
          <mat-label>Wind</mat-label>
          <input matInput formControlName="wind" autocomplete="off" />
          <mat-hint>e.g. SW 8-12 kts</mat-hint>
        </mat-form-field>
        <p class="applies-to">
          Applies to all {{ dayRaces().length }} {{ dayRaces().length === 1 ? 'race' : 'races' }} on this day
        </p>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="dialogRef.close(false)" [disabled]="saving()">Cancel</button>
      <button matButton="filled" type="button" (click)="save()" [disabled]="saving()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: 340px;
    }
    .details-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .field {
      width: 100%;
    }
    .applies-to {
      margin: 8px 0 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 8px 0 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class RaceDayDetailsDialog {
  private readonly data = inject<RaceDayDetailsDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<RaceDayDetailsDialog, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly scoringEngine = inject(ScoringEngine);
  private readonly duties = inject(DutiesService);

  protected readonly dateLabel = format(this.data.race.scheduledStart, 'EEE d MMM yyyy');
  protected readonly dayRaces = computed(() => {
    const races = racesOnSameDay(this.data.race, this.raceCalendar.allRaces());
    return races.length > 0 ? races : [this.data.race];
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    raceOfficer: [this.firstSet(r => r.raceOfficer)],
    wind: [this.firstSet(r => r.wind)],
  });

  /** The duty team's race officer, only for a race day that is today. */
  private readonly dutyRaceOfficer = computed(() => {
    const today = this.duties.raceDayDate();
    if (!today || today !== raceDayDateId(undefined, this.data.race.scheduledStart)) return undefined;
    return dutyRaceOfficer(this.duties.duties());
  });

  constructor() {
    effect(() => {
      const fromDuty = this.dutyRaceOfficer();
      const control = this.form.controls.raceOfficer;
      if (fromDuty && !control.value && control.pristine) control.setValue(fromDuty);
    });
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const raceOfficer = this.form.controls.raceOfficer.value.trim();
    const wind = this.form.controls.wind.value.trim();
    const races = this.dayRaces();
    try {
      await this.raceCalendar.updateRaces(races.map(r => ({ id: r.id, data: { raceOfficer, wind } })));
      const publishedSeries = new Set(races.filter(r => PUBLISHED_STATUSES.has(r.status)).map(r => r.seriesId));
      for (const seriesId of publishedSeries) {
        await this.scoringEngine.scoreCompleteSeries(seriesId);
      }
      this.dialogRef.close(true);
    } catch (e: unknown) {
      console.error('RaceDayDetailsDialog: save failed', e);
      this.error.set('Could not save the race day details. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  /** The given race's value, else the first race that day with a value. */
  private firstSet(field: (race: Race) => string | undefined): string {
    const own = field(this.data.race)?.trim();
    if (own) return own;
    return this.dayRaces().map(field).find(v => !!v?.trim())?.trim() ?? '';
  }
}
