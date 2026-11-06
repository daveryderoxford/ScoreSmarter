import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { TimeRecordingMode } from '../../services/manual-results.service';
import { Race } from 'app/race-calendar';
import { ClubStore } from 'app/club-tenant';
import type { Division } from 'app/race-calendar/model/division';
import type { RaceStart } from 'app/race-calendar/model/race-start';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { NumberField } from 'app/shared/components/number-field/number-field';
import { TimeSignToggle } from 'app/shared/components/time-input/time-sign-toggle';
import { TimeInput } from 'app/shared/components/time-input/time-input';
import { dateAtSecondsOfDay, secondsSinceStartOfDay } from 'app/shared/utils/time-utils';

export interface RaceStartTimeResult {
  mode: TimeRecordingMode;
  starts: RaceStart[];
}

@Component({
  selector: 'app-race-start-time-dialog',
  template: `
    <h2 mat-dialog-title>Set Race Start Time</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <p>Select the timing method used for this race:</p>
        <mat-radio-group formControlName="mode" class="radio-group">
          <mat-radio-button value="tod">Time of Day (Real Time)</mat-radio-button>
          <mat-radio-button value="elapsed">Stopwatch (Elapsed)</mat-radio-button>
        </mat-radio-group>

        <mat-form-field>
          <mat-label>Number of starts</mat-label>
          <input matInput appNumberField formControlName="startCount">
        </mat-form-field>

        <div formArrayName="starts" class="starts-list">
          @for (group of starts.controls; track $index; let i = $index) {
            <div [formGroupName]="i" class="start-row">
              <mat-form-field>
                <mat-label>{{ form.value.mode === 'elapsed' ? 'Stopwatch reading (mmm:ss)' : 'Start Time (HH:mm:ss)' }}</mat-label>
                <input #startTime="appTimeInput" matInput [appTimeInput]="form.value.mode === 'elapsed' ? 'mss' : 'hms'" formControlName="time">
                @if (form.value.mode === 'elapsed') {
                  <app-time-sign-toggle matPrefix [timeInput]="startTime" />
                }
                @if (form.value.mode === 'elapsed') {
                  <mat-hint>Reading at start time. Use +/− if the watch was started after the gun.</mat-hint>
                }
              </mat-form-field>
              <mat-form-field>
                <mat-label>Competitors</mat-label>
                <mat-select formControlName="subset">
                  <mat-option [value]="''">Default</mat-option>
                  @if (fleetOptions.length) {
                    <mat-optgroup label="Fleets">
                      @for (f of fleetOptions; track f.id) {
                        <mat-option [value]="'fleet:' + f.id">{{ f.name }}</mat-option>
                      }
                    </mat-optgroup>
                  }
                  @if (divisionOptions().length) {
                    <mat-optgroup label="Divisions">
                      @for (d of divisionOptions(); track d.id) {
                        <mat-option [value]="'division:' + d.id">{{ d.name }}</mat-option>
                      }
                    </mat-optgroup>
                  }
                </mat-select>
              </mat-form-field>
            </div>
          }
        </div>

        @if (hasDuplicateSubset()) {
          <div class="error">Each fleet, division, or Default can only be used once.</div>
        }

      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" [disabled]="form.invalid || hasDuplicateSubset()" (click)="save()">Set Start Time</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display: flex; flex-direction: column; gap: 16px; min-width: 420px; }
    .radio-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .starts-list { display: flex; flex-direction: column; gap: 8px; }
    .start-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .error { color: var(--mat-sys-error); font-size: 12px; margin-top: -8px; }
  `],
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatSelectModule, ReactiveFormsModule, TimeInput, TimeSignToggle, NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaceStartTimeDialog {
  private dialogRef = inject(MatDialogRef<RaceStartTimeDialog>);
  private data = inject<{ race: Race; }>(MAT_DIALOG_DATA);
  private clubStore = inject(ClubStore);
  private calendar = inject(RaceCalendarStore);
  private readonly fetchedDivisions = signal<Division[] | undefined>(undefined);

  readonly fleetOptions = this.clubStore.club().fleets
    .filter(f => f.type !== 'GeneralHandicap')
    .map(f => ({ id: f.id, name: getFleetName(f) }));

  readonly divisionOptions = computed(() => {
    const series = this.calendar.allSeries().find(s => s.id === this.data.race.seriesId);
    const divisions = series?.divisions ?? this.fetchedDivisions() ?? [];
    return divisions.filter(d => d.name.trim().length > 0);
  });

  readonly form = new FormGroup({
    mode: new FormControl<'tod' | 'elapsed'>(this.data.race.timeInputMode || 'tod', { nonNullable: true }),
    startCount: new FormControl<number>(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    starts: new FormArray<FormGroup>([]),
  });

  get starts(): FormArray<FormGroup> {
    return this.form.controls.starts as FormArray<FormGroup>;
  }

  constructor() {
    const { race } = this.data;
    if (!this.calendar.allSeries().some(s => s.id === race.seriesId)) {
      void this.calendar.getSeriesById(race.seriesId).then(series => {
        this.fetchedDivisions.set(series?.divisions ?? []);
      }).catch(() => {
        this.fetchedDivisions.set([]);
      });
    }

    const existingStarts = race.starts?.length
      ? race.starts.map(s => ({ time: this.secondsFromStored(s.timeOfDay), subset: subsetKey(s) }))
      : [{
          time: race.actualStart != null ? this.secondsFromStored(race.actualStart) : null,
          subset: '',
        }];

    this.form.controls.startCount.setValue(existingStarts.length);
    for (const start of existingStarts) {
      this.starts.push(this.createStartRow(start.time, start.subset));
    }
    // Switching mode reinterprets the numeric seconds (clock vs elapsed), so clear entries.
    this.form.controls.mode.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      for (const ctrl of this.starts.controls) {
        ctrl.get('time')?.setValue(null);
      }
    });

    this.form.controls.startCount.valueChanges.pipe(takeUntilDestroyed()).subscribe(count => {
      const next = Math.max(1, Number(count || 1));
      while (this.starts.length < next) {
        this.starts.push(this.createStartRow(null, ''));
      }
      while (this.starts.length > next) {
        this.starts.removeAt(this.starts.length - 1);
      }
    });
  }

  private createStartRow(time: number | null, subset: string): FormGroup {
    return new FormGroup({
      time: new FormControl<number | null>(time, Validators.required),
      subset: new FormControl<string>(subset),
    });
  }

  hasDuplicateSubset(): boolean {
    const values = this.starts.controls.map(ctrl => String(ctrl.get('subset')?.value ?? ''));
    const seen = new Set<string>();
    for (const v of values) {
      const key = v || '__DEFAULT__';
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }

  /** Stored start Dates decompose to seconds since the scheduled start's local midnight (same for both modes). */
  private secondsFromStored(timeOfDay: Date | string | number): number {
    return secondsSinceStartOfDay(new Date(timeOfDay), new Date(this.data.race.scheduledStart));
  }

  private toStartsPayload(): RaceStart[] {
    return this.starts.controls.map((ctrl, i) => {
      const seconds = Number(ctrl.get('time')?.value ?? 0);
      const timeOfDay = dateAtSecondsOfDay(new Date(this.data.race.scheduledStart), seconds);
      return startFromSubset(`start-${i + 1}`, timeOfDay, String(ctrl.get('subset')?.value ?? ''));
    });
  }

  save() {
    if (this.form.valid && !this.hasDuplicateSubset()) {
      const { mode } = this.form.getRawValue();
      const starts = this.toStartsPayload();
      this.dialogRef.close({ mode, starts } as RaceStartTimeResult);
    }
  }
}

function subsetKey(start: { fleetId?: string; divisionId?: string }): string {
  if (start.fleetId) return `fleet:${start.fleetId}`;
  if (start.divisionId) return `division:${start.divisionId}`;
  return '';
}

function startFromSubset(id: string, timeOfDay: Date, subset: string): RaceStart {
  if (subset.startsWith('fleet:')) {
    return { id, timeOfDay, fleetId: subset.slice('fleet:'.length) };
  }
  if (subset.startsWith('division:')) {
    return { id, timeOfDay, divisionId: subset.slice('division:'.length) };
  }
  return { id, timeOfDay };
}
