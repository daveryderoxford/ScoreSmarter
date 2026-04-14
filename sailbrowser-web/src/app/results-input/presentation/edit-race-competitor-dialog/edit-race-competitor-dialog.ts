import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RaceCompetitor } from 'app/results-input';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { EditRaceCompetitorCommand } from '../../services/race-competitor-edit.service';

type OperationType = EditRaceCompetitorCommand['operation']['type'];

export interface EditRaceCompetitorDialogData {
  competitor: RaceCompetitor;
}

@Component({
  selector: 'app-edit-race-competitor-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Edit competitor</h2>
    <mat-dialog-content [formGroup]="form" class="edit-dialog-content">
      <mat-form-field appearance="outline">
        <mat-label>Change</mat-label>
        <mat-select formControlName="operation">
          <mat-option value="setHelm">Helm</mat-option>
          <mat-option value="setCrew">Crew</mat-option>
          <mat-option value="setBoatClass">Boat class</mat-option>
          <mat-option value="setSailNumber">Sail number</mat-option>
          <mat-option value="setHandicap">Handicap</mat-option>
          <mat-option value="deleteCompetitor">Delete competitor</mat-option>
        </mat-select>
      </mat-form-field>

      @if (needsValue()) {
        @if (isHandicap()) {
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>Scheme</mat-label>
              <mat-select formControlName="handicapScheme">
                @for (h of availableSchemes(); track h) {
                  <mat-option [value]="h">{{ h }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Value</mat-label>
              <input matInput formControlName="handicapValue" type="number" />
            </mat-form-field>
          </div>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>New value</mat-label>
            <input matInput [type]="isSailNumber() ? 'number' : 'text'" formControlName="value" />
          </mat-form-field>
        }
      }

      <mat-form-field appearance="outline">
        <mat-label>Scope</mat-label>
        <mat-select formControlName="scope">
          <mat-option value="raceOnly">This race only</mat-option>
          <mat-option value="linkedBySeriesEntry">Linked races (same series entry)</mat-option>
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" type="button" [disabled]="form.invalid" (click)="submit()">Apply</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .edit-dialog-content { display: flex; flex-direction: column; gap: 8px; min-width: min(92vw, 420px); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditRaceCompetitorDialog {
  readonly dialogRef = inject(MatDialogRef<EditRaceCompetitorDialog, EditRaceCompetitorCommand | undefined>);
  private readonly data = inject<EditRaceCompetitorDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    operation: this.fb.nonNullable.control<OperationType>('setCrew', Validators.required),
    value: this.fb.nonNullable.control<string>(''),
    handicapScheme: this.fb.nonNullable.control<string>(''),
    handicapValue: this.fb.nonNullable.control<number>(0),
    scope: this.fb.nonNullable.control<'raceOnly' | 'linkedBySeriesEntry'>('raceOnly', Validators.required),
  });

  readonly availableSchemes = computed(() => [...new Set(this.data.competitor.handicaps.map(h => h.scheme))]);

  constructor() {
    this.form.controls.operation.valueChanges.subscribe(op => {
      const scope = op === 'setHelm' || op === 'setSailNumber' ? 'linkedBySeriesEntry'
        : op === 'setBoatClass' || op === 'setHandicap' || op === 'deleteCompetitor' ? 'raceOnly'
        : this.form.controls.scope.value;
      this.form.controls.scope.setValue(scope);
      const current = this.currentValueFor(op);
      this.form.controls.value.setValue(current);
      if (op === 'setHandicap') {
        const first = this.data.competitor.handicaps[0];
        this.form.controls.handicapScheme.setValue(first?.scheme ?? '');
        this.form.controls.handicapValue.setValue(first?.value ?? 0);
      }
      this.syncValidators(op);
    });
    this.form.controls.operation.setValue('setCrew');
  }

  needsValue(): boolean {
    return this.form.controls.operation.value !== 'deleteCompetitor';
  }
  isHandicap(): boolean {
    return this.form.controls.operation.value === 'setHandicap';
  }
  isSailNumber(): boolean {
    return this.form.controls.operation.value === 'setSailNumber';
  }

  submit(): void {
    const op = this.form.controls.operation.value;
    const scope = this.form.controls.scope.value;
    const value = this.form.controls.value.value.trim();
    let operation: EditRaceCompetitorCommand['operation'];
    switch (op) {
      case 'setHelm':
        operation = { type: op, value, scope };
        break;
      case 'setCrew':
        operation = { type: op, value, scope };
        break;
      case 'setBoatClass':
        operation = { type: op, value, scope };
        break;
      case 'setSailNumber':
        operation = { type: op, value: Number(value), scope };
        break;
      case 'setHandicap':
        operation = {
          type: op,
          scheme: this.form.controls.handicapScheme.value as HandicapScheme,
          value: Number(this.form.controls.handicapValue.value),
          scope,
        };
        break;
      default:
        if (!confirm('Delete this competitor from the selected scope?')) return;
        operation = { type: 'deleteCompetitor', scope };
        break;
    }
    this.dialogRef.close({ competitorId: this.data.competitor.id, operation });
  }

  private currentValueFor(op: OperationType): string {
    switch (op) {
      case 'setHelm':
        return this.data.competitor.helm;
      case 'setCrew':
        return this.data.competitor.crew ?? '';
      case 'setBoatClass':
        return this.data.competitor.boatClass;
      case 'setSailNumber':
        return String(this.data.competitor.sailNumber);
      default:
        return '';
    }
  }

  private syncValidators(op: OperationType): void {
    const value = this.form.controls.value;
    if (op === 'deleteCompetitor' || op === 'setHandicap') {
      value.clearValidators();
    } else if (op === 'setSailNumber') {
      value.setValidators([Validators.required, Validators.pattern('^[0-9]+$')]);
    } else {
      value.setValidators([Validators.required]);
    }
    value.updateValueAndValidity({ emitEvent: false });

    const hs = this.form.controls.handicapScheme;
    const hv = this.form.controls.handicapValue;
    if (op === 'setHandicap') {
      hs.setValidators([Validators.required]);
      hv.setValidators([Validators.required, Validators.min(1)]);
    } else {
      hs.clearValidators();
      hv.clearValidators();
    }
    hs.updateValueAndValidity({ emitEvent: false });
    hv.updateValueAndValidity({ emitEvent: false });
  }
}
