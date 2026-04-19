import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ResolvedRaceCompetitor } from 'app/results-input';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { calculatePersonalHandicapFromPy, PERSONAL_HANDICAP_BANDS, type PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { EditRaceCompetitorCommand } from '../../services/race-competitor-edit.service';

type OperationType = EditRaceCompetitorCommand['operation']['type'];

export interface EditRaceCompetitorDialogData {
  /** The race row being edited - identity comes from its SeriesEntry. */
  competitor: ResolvedRaceCompetitor;
}

/**
 * Edit dialog for a single race row.
 *
 * Identity, boat and handicap edits are always applied to the SeriesEntry
 * (per-hull) - there is no per-race scope option for them. Crew is the only
 * field where a per-race override makes sense, so it gets a scope picker
 * (`raceOnly` => `RaceCompetitor.crewOverride`; `wholeSeries` => entry crew).
 */
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
          <mat-option value="setPersonalHandicapBand">Personal handicap band</mat-option>
          <mat-option value="deleteCompetitor">Delete competitor</mat-option>
        </mat-select>
      </mat-form-field>

      @if (showHandicap()) {
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
      } @else if (showPersonalBand()) {
        <mat-form-field appearance="outline">
          <mat-label>Personal handicap band</mat-label>
          <mat-select formControlName="personalBand">
            <mat-option [value]="null">(none)</mat-option>
            @for (band of personalBands; track band) {
              <mat-option [value]="band">{{ band }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else if (showText()) {
        <mat-form-field appearance="outline">
          <mat-label>New value</mat-label>
          <input matInput [type]="isSailNumber() ? 'number' : 'text'" formControlName="value" />
        </mat-form-field>
      }

      @if (isCrew()) {
        <mat-form-field appearance="outline">
          <mat-label>Apply to</mat-label>
          <mat-select formControlName="crewScope">
            <mat-option value="raceOnly">This race only</mat-option>
            <mat-option value="wholeSeries">All races for this hull</mat-option>
          </mat-select>
        </mat-form-field>
      } @else if (!isDelete()) {
        <p class="hint">Applies to every race for this hull in the series.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" type="button" [disabled]="form.invalid" (click)="submit()">Apply</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .edit-dialog-content { display: flex; flex-direction: column; gap: 8px; min-width: min(92vw, 420px); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .hint { color: var(--mat-sys-on-surface-variant); margin: 0; font-size: 12px; }
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
    personalBand: this.fb.control<PersonalHandicapBand | null>(null),
    crewScope: this.fb.nonNullable.control<'raceOnly' | 'wholeSeries'>('raceOnly', Validators.required),
  });

  readonly availableSchemes = computed(() => [...new Set(this.data.competitor.handicaps.map(h => h.scheme))].filter(s => s !== 'Personal'));
  readonly personalBands = PERSONAL_HANDICAP_BANDS;

  constructor() {
    this.form.controls.operation.valueChanges.subscribe(op => {
      const current = this.currentValueFor(op);
      this.form.controls.value.setValue(current);
      if (op === 'setHandicap') {
        const first = this.data.competitor.handicaps.find(h => h.scheme !== 'Personal');
        this.form.controls.handicapScheme.setValue(first?.scheme ?? 'PY');
        this.form.controls.handicapValue.setValue(first?.value ?? 0);
      }
      if (op === 'setPersonalHandicapBand') {
        this.form.controls.personalBand.setValue(this.data.competitor.personalHandicapBand ?? null);
      }
      this.syncValidators(op);
    });
    this.form.controls.operation.setValue('setCrew');
  }

  isCrew = () => this.form.controls.operation.value === 'setCrew';
  isDelete = () => this.form.controls.operation.value === 'deleteCompetitor';
  isSailNumber = () => this.form.controls.operation.value === 'setSailNumber';
  showHandicap = () => this.form.controls.operation.value === 'setHandicap';
  showPersonalBand = () => this.form.controls.operation.value === 'setPersonalHandicapBand';
  showText = () => {
    const op = this.form.controls.operation.value;
    return op === 'setHelm' || op === 'setCrew' || op === 'setBoatClass' || op === 'setSailNumber';
  };

  submit(): void {
    const op = this.form.controls.operation.value;
    const value = this.form.controls.value.value.trim();
    let operation: EditRaceCompetitorCommand['operation'];
    switch (op) {
      case 'setHelm':
        operation = { type: op, value };
        break;
      case 'setCrew':
        operation = { type: op, value, scope: this.form.controls.crewScope.value };
        break;
      case 'setBoatClass':
        operation = { type: op, value };
        break;
      case 'setSailNumber':
        operation = { type: op, value: Number(value) };
        break;
      case 'setHandicap': {
        const scheme = this.form.controls.handicapScheme.value as HandicapScheme;
        const handicapValue = Number(this.form.controls.handicapValue.value);
        operation = { type: op, scheme, value: handicapValue };
        break;
      }
      case 'setPersonalHandicapBand':
        operation = { type: op, band: this.form.controls.personalBand.value ?? undefined };
        break;
      default:
        if (!confirm('Delete this competitor from this race?')) return;
        operation = { type: 'deleteCompetitor' };
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
    if (op === 'deleteCompetitor' || op === 'setHandicap' || op === 'setPersonalHandicapBand') {
      value.clearValidators();
    } else if (op === 'setSailNumber') {
      value.setValidators([Validators.required, Validators.pattern('^[0-9]+$')]);
    } else if (op === 'setCrew') {
      value.clearValidators();
    } else {
      value.setValidators([Validators.required]);
    }
    value.updateValueAndValidity({ emitEvent: false });

    const hs = this.form.controls.handicapScheme;
    const hv = this.form.controls.handicapValue;
    const pb = this.form.controls.personalBand;
    if (op === 'setHandicap') {
      hs.setValidators([Validators.required]);
      hv.setValidators([Validators.required, Validators.min(1)]);
      pb.clearValidators();
    } else {
      hs.clearValidators();
      hv.clearValidators();
      pb.clearValidators();
    }
    hs.updateValueAndValidity({ emitEvent: false });
    hv.updateValueAndValidity({ emitEvent: false });
    pb.updateValueAndValidity({ emitEvent: false });
  }
}
