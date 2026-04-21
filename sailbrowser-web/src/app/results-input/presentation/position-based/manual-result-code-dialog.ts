import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Race } from 'app/race-calender';
import { ResultCode } from 'app/scoring/model/result-code';
import { RaceTimeInput } from '../handicap/race-time-input';
import { isFinishedComp } from 'app/scoring/model/result-code-scoring';
import { ResultCodeSelect } from '../result-code-select';

export interface ManualResultCodeDialogData {
  race: Race;
  initialResultCode: ResultCode;
  initialFinishTime: Date | null;
}

export interface ManualResultCodeDialogResult {
  resultCode: ResultCode;
  finishTime: Date | null;
}

@Component({
  selector: 'app-manual-result-code-dialog',
  template: `
    <h2 mat-dialog-title>Set result</h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <app-result-code-select formControlName="resultCode" />

        @if (data.race.type === 'Level Rating') {
          <mat-form-field>
            <mat-label>Finish time (optional)</mat-label>
            <app-race-time-input
              formControlName="finishTime"
              [mode]="timeInputMode()"
              [baseTime]="timeBaseTime()"
              [scheduledStart]="data.race.scheduledStart"
            />
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancel</button>
      <button
        matButton="filled"
        type="button"
        (click)="save()"
        [disabled]="form.controls.resultCode.value === data.initialResultCode && form.controls.finishTime.value === data.initialFinishTime"
      >
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 360px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    ResultCodeSelect,
    RaceTimeInput,
  ],
})
export class ManualResultCodeDialog {
  private readonly dialogRef = inject<MatDialogRef<ManualResultCodeDialog>>(MatDialogRef);
  protected readonly data = inject<ManualResultCodeDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    resultCode: this.fb.nonNullable.control<ResultCode>(this.data.initialResultCode),
    finishTime: this.fb.control<Date | null>(this.data.initialFinishTime),
  });

  timeInputMode(): 'tod' | 'elapsed' {
    return this.data.race.timeInputMode || 'tod';
  }

  timeBaseTime(): Date {
    return this.data.race.actualStart ? new Date(this.data.race.actualStart) : new Date();
  }

  save(): void {
    const raw = this.form.getRawValue();

    // If the code isn't a "finished" code, finish time is irrelevant; keep it null
    // to avoid confusing UI state.
    const finishTime = isFinishedComp(raw.resultCode) ? raw.finishTime : null;

    this.dialogRef.close({
      resultCode: raw.resultCode,
      finishTime,
    } satisfies ManualResultCodeDialogResult);
  }
}

