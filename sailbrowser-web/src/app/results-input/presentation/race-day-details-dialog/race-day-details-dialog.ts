import { Component, computed, effect, inject, signal } from '@angular/core';
import { deleteField } from '@angular/fire/firestore';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DutiesService, dutyRaceOfficer } from 'app/duties';
import { raceDayDateId } from 'app/duties/services/duties.service';
import { ScoringEngine } from 'app/published-results/services/scoring-engine';
import { RaceCalendarStore } from 'app/race-calendar';
import { Race } from 'app/race-calendar/model/race';
import { racesOnSameDay } from 'app/race-calendar/model/races-on-same-day';
import { Wind, WIND_DIRECTIONS, WindDirection } from 'app/race-calendar/model/wind';
import { NumberField } from 'app/shared/components/number-field/number-field';
import { format } from 'date-fns';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';

export interface RaceDayDetailsDialogData {
  race: Race;
}

const PUBLISHED_STATUSES = new Set<Race['status']>(['In progress', 'Completed']);
const MAX_WIND_SPEED_KNOTS = 100;

/** Sets the race officer and wind for every race on the given race's day. Returns true when saved. */
@Component({
  selector: 'app-race-day-details-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NumberField,
  ],
  template: `
    <h2 mat-dialog-title>Race day: {{ dateLabel }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="details-form" (ngSubmit)="save()">
        <mat-form-field class="field">
          <mat-label>Race officer</mat-label>
          <input matInput formControlName="raceOfficer" autocomplete="off" />
        </mat-form-field>
        <div class="wind-row">
          <mat-form-field class="field">
            <mat-label>Wind speed</mat-label>
            <input matInput appNumberField formControlName="windSpeed" autocomplete="off" />
            <span matTextSuffix>kts</span>
            <mat-error>0 to {{ maxWindSpeed }} knots</mat-error>
          </mat-form-field>
          <mat-form-field class="field">
            <mat-label>Wind direction</mat-label>
            <mat-select formControlName="windDirection">
              <mat-option [value]="null">Not set</mat-option>
              @for (direction of directions; track direction) {
                <mat-option [value]="direction">{{ direction }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
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
    .wind-row {
      display: flex;
      gap: 12px;
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
  protected readonly directions = WIND_DIRECTIONS;
  protected readonly maxWindSpeed = MAX_WIND_SPEED_KNOTS;
  protected readonly dayRaces = computed(() => {
    const races = racesOnSameDay(this.data.race, this.raceCalendar.allRaces());
    return races.length > 0 ? races : [this.data.race];
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly initialWind = this.firstWind();

  protected readonly form = this.fb.nonNullable.group({
    raceOfficer: [this.firstSet(r => r.raceOfficer)],
    windSpeed: [
      this.initialWind.windSpeed ?? (null as number | null),
      [Validators.min(0), Validators.max(MAX_WIND_SPEED_KNOTS)],
    ],
    windDirection: [this.initialWind.windDirection ?? (null as WindDirection | null)],
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const raceOfficer = normaliseWhitespace(this.form.controls.raceOfficer.value);
    const { windSpeed, windDirection } = this.form.getRawValue();
    const races = this.dayRaces();
    try {
      await this.raceCalendar.updateRaces(
        races.map(r => ({
          id: r.id,
          data: {
            raceOfficer,
            windSpeed: windSpeed ?? deleteField(),
            windDirection: windDirection ?? deleteField(),
          },
        })),
      );
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

  /** Speed and direction from the same race: the given race if it has either, else the first race that day that does. */
  private firstWind(): Wind {
    const hasWind = (r: Race) => r.windSpeed != null || !!r.windDirection;
    const source = hasWind(this.data.race) ? this.data.race : this.dayRaces().find(hasWind);
    return { windSpeed: source?.windSpeed, windDirection: source?.windDirection };
  }
}
