import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { addSeconds, format, startOfDay } from 'date-fns';
import { TimeRecordingMode } from '../../services/manual-results.service';
import { Race } from 'app/race-calender';
import { ClubStore } from 'app/club-tenant';
import type { RaceStart } from 'app/race-calender/model/race-start';
import { getFleetName } from 'app/club-tenant/model/fleet';

export interface RaceStartTimeResult {
  mode: TimeRecordingMode;
  starts: RaceStart[];
}

/**
 * Elapsed (stopwatch) starts are stored as a Date relative to local midnight on
 * the race day. The dialog edits them as a signed offset in minutes so the
 * stopwatch can have been started *before* the class start (negative offset).
 */
export function toStartDateFromElapsedOffset(scheduledStart: Date | string | number, offsetMinutes: number): Date {
  const base = startOfDay(new Date(scheduledStart));
  const seconds = Math.round(offsetMinutes * 60);
  return addSeconds(base, seconds);
}

export function toElapsedOffsetMinutes(scheduledStart: Date | string | number, timeOfDay: Date | string | number): number {
  const base = startOfDay(new Date(scheduledStart));
  const seconds = Math.round((new Date(timeOfDay).getTime() - base.getTime()) / 1000);
  return seconds / 60;
}

function formatElapsedOffsetInput(offsetMinutes: number): string {
  if (Number.isInteger(offsetMinutes)) return String(offsetMinutes);
  return String(Number(offsetMinutes.toFixed(4)));
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

        <mat-form-field appearance="outline">
          <mat-label>Number of starts</mat-label>
          <input matInput type="number" min="1" formControlName="startCount">
        </mat-form-field>

        <div formArrayName="starts" class="starts-list">
          @for (group of starts.controls; track $index; let i = $index) {
            <div [formGroupName]="i" class="start-row">
              @if (form.value.mode === 'tod') {
                <mat-form-field appearance="outline">
                  <mat-label>Start Time (HH:mm:ss)</mat-label>
                  <input matInput type="time" step="1" formControlName="time">
                </mat-form-field>
              } @else {
                <mat-form-field appearance="outline">
                  <mat-label>Stopwatch reading (minutes)</mat-label>
                  <input matInput type="number" step="any" formControlName="time">
                  <mat-hint>Reading at start time.</mat-hint>
                </mat-form-field>
              }
              <mat-form-field appearance="outline">
                <mat-label>Fleet (optional)</mat-label>
                <mat-select formControlName="fleetId">
                  <mat-option [value]="''">Default</mat-option>
                  @for (f of fleetOptions; track f.id) {
                    <mat-option [value]="f.id">{{ f.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
          }
        </div>

        @if (hasDuplicateFleetSelection()) {
          <div class="error">Each fleet (or No fleet) must only appear once.</div>
        }

      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || hasDuplicateFleetSelection()" (click)="save()">Set Start Time</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display: flex; flex-direction: column; gap: 16px; min-width: 420px; }
    .radio-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .starts-list { display: flex; flex-direction: column; gap: 8px; }
    .start-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .error { color: var(--mat-sys-error); font-size: 12px; margin-top: -8px; }
  `],
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatSelectModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaceStartTimeDialog {
  private dialogRef = inject(MatDialogRef<RaceStartTimeDialog>);
  private data = inject<{ race: Race; }>(MAT_DIALOG_DATA);
  private clubStore = inject(ClubStore);

  readonly fleetOptions = this.clubStore.club().fleets
    .filter(f => f.type !== 'GeneralHandicap')
    .map(f => ({ id: f.id, name: getFleetName(f) }));

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
    const initialMode = race.timeInputMode || 'tod';
    const existingStarts = race.starts?.length
      ? race.starts.map(s => ({ time: this.formatTimeForMode(initialMode, s.timeOfDay), fleetId: s.fleetId ?? '' }))
      : [{
          time: race.actualStart ? this.formatTimeForMode(initialMode, race.actualStart) : '',
          fleetId: '',
        }];

    this.form.controls.startCount.setValue(existingStarts.length);
    for (const start of existingStarts) {
      this.starts.push(this.createStartRow(start.time, start.fleetId));
    }
    this.form.controls.mode.valueChanges.pipe(takeUntilDestroyed()).subscribe(mode => {
      for (const ctrl of this.starts.controls) {
        const timeCtrl = ctrl.get('time');
        if (!timeCtrl) continue;
        if (mode === 'elapsed') {
          if (!timeCtrl.value) timeCtrl.setValue('0');
          else if (/^\d{2}:\d{2}/.test(String(timeCtrl.value))) timeCtrl.setValue('0');
        } else {
          if (!/^\d{2}:\d{2}/.test(String(timeCtrl.value))) timeCtrl.setValue('');
        }
      }
    });

    this.form.controls.startCount.valueChanges.pipe(takeUntilDestroyed()).subscribe(count => {
      const next = Math.max(1, Number(count || 1));
      while (this.starts.length < next) {
        this.starts.push(this.createStartRow('', ''));
      }
      while (this.starts.length > next) {
        this.starts.removeAt(this.starts.length - 1);
      }
    });
  }

  private createStartRow(time: string, fleetId: string): FormGroup {
    return new FormGroup({
      time: new FormControl<string>(time, Validators.required),
      fleetId: new FormControl<string>(fleetId),
    });
  }

  hasDuplicateFleetSelection(): boolean {
    const values = this.starts.controls.map(ctrl => String(ctrl.get('fleetId')?.value ?? ''));
    const seen = new Set<string>();
    for (const v of values) {
      const key = v || '__NO_FLEET__';
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }

  private formatTimeForMode(mode: TimeRecordingMode, timeOfDay: Date | string | number): string {
    if (mode === 'elapsed') {
      return formatElapsedOffsetInput(toElapsedOffsetMinutes(this.data.race.scheduledStart, timeOfDay));
    }
    return format(new Date(timeOfDay), 'HH:mm:ss');
  }

  private toStartDateFromClock(time: string): Date {
    const dateStr = new Date(this.data.race.scheduledStart).toDateString();
    return new Date(`${dateStr} ${time}`);
  }

  private toStartsPayload(mode: TimeRecordingMode): RaceStart[] {
    return this.starts.controls.map((ctrl, i) => {
      const raw = String(ctrl.get('time')?.value ?? '');
      const fleetId = String(ctrl.get('fleetId')?.value ?? '');
      const timeOfDay = mode === 'elapsed'
        ? toStartDateFromElapsedOffset(this.data.race.scheduledStart, Number(raw))
        : this.toStartDateFromClock(raw);
      return {
        id: `start-${i + 1}`,
        timeOfDay,
        ...(fleetId ? { fleetId } : {}),
      };
    });
  }

  save() {
    if (this.form.valid && !this.hasDuplicateFleetSelection()) {
      const { mode } = this.form.getRawValue();
      const starts = this.toStartsPayload(mode);
      this.dialogRef.close({ mode, starts } as RaceStartTimeResult);
    }
  }
}
