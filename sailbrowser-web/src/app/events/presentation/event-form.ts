import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { type Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import { ClubStore } from 'app/club-tenant/services/club-store';
import type { Series } from 'app/race-calendar/model/series';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import { NumberField } from 'app/shared/components/number-field/number-field';
import { SubmitButton } from 'app/shared/components/submit-button';
import { TimeInput } from 'app/shared/components/time-input/time-input';
import { startOfDay } from 'date-fns';
import { map, startWith } from 'rxjs';
import type { OpenEvent } from '../model/open-event';

const DEFAULT_START_SECONDS = 10 * 3600 + 30 * 60;

export interface EventFormValue {
  event: Omit<OpenEvent, 'id'>;
  /** Add only: one series is created per fleet. */
  fleets: Fleet[];
  racesPerDay: number;
  firstStartSeconds: number;
  /** Edit only: the series linked to the event. */
  seriesIds: string[];
}

/** Open meeting details. Adding also sets up one series per fleet; editing links existing series. */
@Component({
  selector: 'app-event-form',
  imports: [
    ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatButtonModule, MatIconModule, RouterLink, NumberField, TimeInput, SubmitButton,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-form-field>
        <mat-label>Event name</mat-label>
        <input matInput formControlName="name" placeholder="e.g. ILCA Open">
        <mat-error>Name required</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Season</mat-label>
        <mat-select formControlName="seasonId">
          @for (season of seasons(); track season.id) {
            <mat-option [value]="season.id">{{ season.name }}</mat-option>
          }
        </mat-select>
        @if (event()) {
          <mat-hint>Fixed once the event has series</mat-hint>
        }
      </mat-form-field>

      @if (event()) {
        <mat-form-field>
          <mat-label>Series</mat-label>
          <mat-select formControlName="seriesIds" multiple>
            @for (series of seasonSeries(); track series.id) {
              <mat-option [value]="series.id">{{ series.name }}</mat-option>
            }
          </mat-select>
          <mat-hint>Removing a series keeps its races and entries</mat-hint>
        </mat-form-field>
      }

      <mat-form-field>
        <mat-label>Duration</mat-label>
        <mat-date-range-input [rangePicker]="dayPicker">
          <input matStartDate formControlName="startDate" placeholder="First day">
          <input matEndDate formControlName="endDate" placeholder="Last day">
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="dayPicker" />
        <mat-date-range-picker #dayPicker />
        @if (form.controls.endDate.hasError('matEndDateInvalid')) {
          <mat-error>Last day is before the first day</mat-error>
        } @else {
          <mat-error>Choose the first and last day</mat-error>
        }
      </mat-form-field>

      @if (!event()) {
        <mat-form-field>
          <mat-label>Fleets</mat-label>
          <mat-select formControlName="fleetIds" multiple>
            @for (fleet of fleets(); track fleet.id) {
              <mat-option [value]="fleet.id">{{ fleetName(fleet) }}</mat-option>
            }
          </mat-select>
          <mat-hint>One short series is created for each fleet</mat-hint>
          <mat-error>Choose at least one fleet</mat-error>
        </mat-form-field>
        <div class="fleet-missing">
          <span>Fleet missing? Add it, then come back.</span>
          <a mat-stroked-button routerLink="/club/fleets/add">
            <mat-icon>add</mat-icon>
            Add fleet
          </a>
        </div>

        <mat-form-field>
          <mat-label>Races per day</mat-label>
          <input matInput appNumberField formControlName="racesPerDay">
          <mat-error>At least one race a day</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>First start time</mat-label>
          <input matInput appTimeInput formControlName="firstStartTime">
        </mat-form-field>
      }

      <mat-form-field>
        <mat-label>Notice of race link (optional)</mat-label>
        <input matInput type="url" formControlName="noticeOfRaceUrl" placeholder="https://">
      </mat-form-field>

      <mat-form-field>
        <mat-label>Sailing instructions link (optional)</mat-label>
        <input matInput type="url" formControlName="sailingInstructionsUrl" placeholder="https://">
      </mat-form-field>

      <app-submit-button [disabled]="invalid()" [busy]="busy()">
        {{ event() ? 'Save event' : 'Create event' }}
      </app-submit-button>
    </form>
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 12px; }
    .fleet-missing {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin: 4px 0 12px;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class EventForm {
  private readonly clubStore = inject(ClubStore);
  private readonly calendar = inject(RaceCalendarStore);

  readonly event = input<OpenEvent | undefined>();
  /** Edit only: series currently linked to the event. */
  readonly linkedSeriesIds = input<readonly string[]>([]);
  readonly busy = input(false);
  readonly save = output<EventFormValue>();

  readonly seasons = computed(() => this.clubStore.club().seasons);
  readonly fleets = computed(() => this.clubStore.club().fleets);
  readonly fleetName = getFleetName;

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    seasonId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    startDate: new FormControl<Date | null>(new Date(), [Validators.required]),
    endDate: new FormControl<Date | null>(new Date(), [Validators.required]),
    fleetIds: new FormControl<string[]>([], { nonNullable: true }),
    racesPerDay: new FormControl<number | null>(3, [Validators.min(1)]),
    firstStartTime: new FormControl<number | null>(DEFAULT_START_SECONDS),
    seriesIds: new FormControl<string[]>([], { nonNullable: true }),
    noticeOfRaceUrl: new FormControl('', { nonNullable: true }),
    sailingInstructionsUrl: new FormControl('', { nonNullable: true }),
  });

  private readonly seasonId = toSignal(
    this.form.controls.seasonId.valueChanges.pipe(startWith(this.form.controls.seasonId.value)),
    { initialValue: '' },
  );

  /** Edit: series of the event's season that are free or already in this event. */
  readonly seasonSeries = computed((): Series[] => {
    const eventId = this.event()?.id;
    return this.calendar.allSeries()
      .filter(s => s.seasonId === this.seasonId() && (!s.eventId || s.eventId === eventId))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly invalid = toSignal(
    this.form.statusChanges.pipe(startWith(null), map(() => this.form.invalid)),
    { initialValue: this.form.invalid },
  );

  private hydratedId = '';

  constructor() {
    const current = this.seasons().find(s => s.status === 'current');
    if (current) this.form.controls.seasonId.setValue(current.id);

    effect(() => {
      const event = this.event();
      const add = !event;
      this.form.controls.fleetIds.setValidators(add ? [Validators.required] : []);
      this.form.controls.racesPerDay.setValidators(add ? [Validators.required, Validators.min(1)] : []);
      this.form.controls.firstStartTime.setValidators(add ? [Validators.required] : []);
      // Hydrate once per event so store refreshes do not wipe edits in progress.
      if (event && event.id !== this.hydratedId) {
        this.hydratedId = event.id;
        this.form.patchValue({
          name: event.name,
          seasonId: event.seasonId,
          startDate: event.startDate,
          endDate: event.endDate,
          noticeOfRaceUrl: event.noticeOfRaceUrl ?? '',
          sailingInstructionsUrl: event.sailingInstructionsUrl ?? '',
          seriesIds: [...this.linkedSeriesIds()],
        });
        this.form.controls.seasonId.disable();
        this.form.markAsPristine();
      }
      this.form.updateValueAndValidity();
    });
  }

  canDeactivate(): boolean {
    return !this.form.dirty;
  }

  submit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const fleets = this.fleets().filter(f => v.fleetIds.includes(f.id));
    this.save.emit({
      event: {
        name: v.name,
        seasonId: v.seasonId,
        startDate: startOfDay(v.startDate!),
        endDate: startOfDay(v.endDate!),
        noticeOfRaceUrl: v.noticeOfRaceUrl,
        sailingInstructionsUrl: v.sailingInstructionsUrl,
      },
      fleets,
      racesPerDay: v.racesPerDay ?? 1,
      firstStartSeconds: v.firstStartTime ?? DEFAULT_START_SECONDS,
      seriesIds: v.seriesIds,
    });
    this.form.markAsPristine();
  }
}
