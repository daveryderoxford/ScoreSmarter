import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { TimeRecordingMode } from '../../services/manual-results.service';
import { Race } from 'app/race-calender';
import { ClubStore } from 'app/club-tenant';
import type { RaceStart } from 'app/race-calender/model/race-start';
import { getFleetName } from 'app/club-tenant/model/fleet';
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
          <input matInput type="number" min="1" formControlName="startCount">
        </mat-form-field>

        <div formArrayName="starts" class="starts-list">
          @for (group of starts.controls; track $index; let i = $index) {
            <div [formGroupName]="i" class="start-row">
              <mat-form-field>
                <mat-label>{{ form.value.mode === 'elapsed' ? 'Stopwatch reading (mmm:ss)' : 'Start Time (HH:mm:ss)' }}</mat-label>
                <app-time-input formControlName="time" [format]="form.value.mode === 'elapsed' ? 'mss' : 'hms'" />
                @if (form.value.mode === 'elapsed') {
                  <mat-hint>Reading at start time. Use '-' if the watch was started after the gun.</mat-hint>
                }
              </mat-form-field>
              <mat-form-field>
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
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" [disabled]="form.invalid || hasDuplicateFleetSelection()" (click)="save()">Set Start Time</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display: flex; flex-direction: column; gap: 16px; min-width: 420px; }
    .radio-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .starts-list { display: flex; flex-direction: column; gap: 8px; }
    .start-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .error { color: var(--mat-sys-error); font-size: 12px; margin-top: -8px; }
  `],
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, MatSelectModule, ReactiveFormsModule, TimeInput],
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
    const existingStarts = race.starts?.length
      ? race.starts.map(s => ({ time: this.secondsFromStored(s.timeOfDay), fleetId: s.fleetId ?? '' }))
      : [{
          time: race.actualStart != null ? this.secondsFromStored(race.actualStart) : null,
          fleetId: '',
        }];

    this.form.controls.startCount.setValue(existingStarts.length);
    for (const start of existingStarts) {
      this.starts.push(this.createStartRow(start.time, start.fleetId));
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

  private createStartRow(time: number | null, fleetId: string): FormGroup {
    return new FormGroup({
      time: new FormControl<number | null>(time, Validators.required),
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

  /** Stored start Dates decompose to seconds since the scheduled start's local midnight (same for both modes). */
  private secondsFromStored(timeOfDay: Date | string | number): number {
    return secondsSinceStartOfDay(new Date(timeOfDay), new Date(this.data.race.scheduledStart));
  }

  private toStartsPayload(): RaceStart[] {
    return this.starts.controls.map((ctrl, i) => {
      const seconds = Number(ctrl.get('time')?.value ?? 0);
      const fleetId = String(ctrl.get('fleetId')?.value ?? '');
      const timeOfDay = dateAtSecondsOfDay(new Date(this.data.race.scheduledStart), seconds);
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
      const starts = this.toStartsPayload();
      this.dialogRef.close({ mode, starts } as RaceStartTimeResult);
    }
  }
}
