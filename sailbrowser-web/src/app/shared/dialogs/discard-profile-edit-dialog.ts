import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { formatDiscardScheduleSummary, validateDiscardRaceSequence } from 'app/scoring/model/discard-profile';

/** `discards` are milestone race numbers; returned value is the same shape (triggers). */
export interface DiscardProfileDialogData {
  title: string;
  /** Calendar / UI hint for sizing; does not change stored trigger list. */
  raceCount: number;
  discards: readonly number[];
}

function ordinalEn(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

@Component({
  selector: 'app-discard-profile-edit-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatTableModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content class="discard-dlg-body">
      @if (errorText(); as err) {
        <p class="error" role="alert">{{ err }}</p>
      }

      <p id="discard-hint" class="hint">
        Each row is <strong>one</strong> discard that becomes usable after that many races. Later rows cannot use an earlier milestone than the row above; use the same number twice when two discards unlock together.
      </p>

      <p class="summary" aria-live="polite">{{ summaryText() }}</p>

      <div class="table-scroll" [attr.aria-describedby]="'discard-hint'">
        <table mat-table [dataSource]="rowSource()" class="bp-table">
          <ng-container matColumnDef="discardLabel">
            <th mat-header-cell *matHeaderCellDef>Discard</th>
            <td mat-cell *matCellDef="let ri" class="ordinal-cell">{{ ordinalAt(ri) }}</td>
          </ng-container>

          <ng-container matColumnDef="afterRace">
            <th mat-header-cell *matHeaderCellDef>After race number</th>
            <td mat-cell *matCellDef="let ri">
              <input
                type="number"
                step="1"
                [attr.min]="minAfterRaceAt(ri)"
                inputmode="numeric"
                class="bp-input bp-input-num"
                [formControl]="triggerControlAt(ri)"
                [attr.aria-label]="'After race number for ' + ordinalAt(ri) + ' discard'"
                (blur)="onTriggerBlur()"
              />
            </td>
          </ng-container>

          <ng-container matColumnDef="delete">
            <th mat-header-cell *matHeaderCellDef class="del-col-head"></th>
            <td mat-cell *matCellDef="let ri">
              <button
                mat-icon-button
                type="button"
                class="del-btn"
                aria-label="Delete this discard"
                (click)="removeRow(ri)"
              >
                <mat-icon>close</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let ri; columns: displayedColumns"></tr>
        </table>

        @if (triggerRows.length === 0) {
          <p class="empty-hint">No discards configured — allowances stay at zero unless you add one.</p>
        }
      </div>
    </mat-dialog-content>
    <mat-divider />
    <mat-dialog-actions class="discard-actions">
      <button mat-button type="button" [disabled]="!canAddDiscard()" (click)="addDiscard()">
        <mat-icon>add</mat-icon>
        Add Discard
      </button>
      <div class="action-right">
        <button mat-button type="button" (click)="cancel()">Cancel</button>
        <button matButton="filled" type="button"  (click)="save()">Save</button>
      </div>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .discard-dlg-body {
      min-width: 360px;
      padding-top: 4px;
    }
    .hint {
      font-size: 13px;
      color: var(--mat-sys-outline);
      margin: 0 0 8px;
      line-height: 1.35;
    }
    .summary {
      font-size: 13px;
      font-weight: 500;
      color: var(--mat-sys-on-surface);
      margin: 0 0 10px;
      line-height: 1.35;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0 0 8px;
      font-size: 13px;
    }
    .table-scroll {
      max-height: min(380px, 55vh);
      overflow: auto;
      margin: 0 -8px;
      padding: 0 8px;
    }
    .bp-table {
      width: 100%;
    }
    .ordinal-cell {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .bp-table .mat-mdc-cell,
    .bp-table .mat-mdc-header-cell {
      padding: 4px 8px;
      font-size: 13px;
      vertical-align: middle;
    }
    .bp-input {
      box-sizing: border-box;
      width: 100%;
      max-width: 6rem;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid color-mix(in srgb, var(--mat-sys-outline) 65%, transparent);
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      font: inherit;
      font-variant-numeric: tabular-nums;
    }
    .bp-input-num {
      max-width: 5.5rem;
    }
    .bp-input:focus {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 0;
      border-color: transparent;
    }
    .del-col-head {
      width: 44px;
    }
    .del-btn {
      margin: 0 auto;
      display: block;
    }
    .empty-hint {
      font-size: 12px;
      color: var(--mat-sys-outline);
      margin: 8px 0 0;
    }
    .discard-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      gap: 8px;
      padding-top: 8px;
      box-sizing: border-box;
    }
    .discard-actions mat-icon {
      margin-right: 4px;
      vertical-align: middle;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .action-right {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }
  `,
})
export class DiscardProfileEditDialog {
  readonly dialogRef = inject(MatDialogRef<DiscardProfileEditDialog>);
  readonly data = inject<DiscardProfileDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly errorText = signal<string>('');
  readonly summaryText = signal<string>('');

  readonly displayedColumns: string[] = ['discardLabel', 'afterRace', 'delete'];

  readonly triggerRows = this.fb.array<FormControl<number>>(this.buildInitialTriggers());

  readonly rowSource = signal<number[]>(this.triggerRows.controls.map((_, i) => i));

  constructor() {
    this.setTriggerValidatorsFromRows();
    this.clampTriggersFromRow(0, { normalizeEmpty: false });
    this.refreshSummaryPreview();
    this.triggerRows.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.errorText.set('');
      this.refreshSummaryPreview();
    });
  }

  ordinalAt(rowIndex: number): string {
    return ordinalEn(rowIndex + 1);
  }

  minAfterRaceAt(rowIndex: number): number {
    if (rowIndex <= 0) return 1;
    const prev = Number(this.triggerRows.at(rowIndex - 1)?.value);
    return Number.isFinite(prev) ? Math.max(1, Math.floor(prev)) : 1;
  }

  private buildInitialTriggers(): FormControl<number>[] {
    const triggers = [...this.data.discards].filter(
      t => typeof t === 'number' && Number.isFinite(t) && t >= 1,
    );
    return triggers.map(r => this.newTriggerControl(Number(r)));
  }

  private newTriggerControl(initial: number): FormControl<number> {
    const v =
      Number.isFinite(initial) && initial >= 1 ? Math.floor(initial) : 1;
    return this.fb.nonNullable.control(v, {
      validators: [
        Validators.required,
        Validators.min(1),
      ],
      updateOn: 'blur',
    });
  }

  /** Order / range clamp runs after the field commits (won’t interrupt multi-digit typing mid-focus). */
  onTriggerBlur(): void {
    this.errorText.set('');
    this.clampTriggersFromRow(0, { normalizeEmpty: true });
    this.setTriggerValidatorsFromRows();
    for (const c of this.triggerRows.controls) {
      c.updateValueAndValidity();
    }
    this.refreshSummaryPreview();
  }

  canAddDiscard(): boolean {
    return true;
  }

  addDiscard(): void {
    if (!this.canAddDiscard()) return;
    const lastIdx = this.triggerRows.length - 1;
    const next =
      lastIdx >= 0
        ? Math.max(1, Math.floor(Number(this.triggerRows.at(lastIdx)!.value)))
        : 1;
    this.triggerRows.push(this.newTriggerControl(next));
    this.rebuildIndices();
    this.setTriggerValidatorsFromRows();
  }

  removeRow(index: number): void {
    if (index >= 0 && index < this.triggerRows.length) {
      this.triggerRows.removeAt(index);
      this.rebuildIndices();
      this.clampTriggersFromRow(0, { normalizeEmpty: false });
      this.setTriggerValidatorsFromRows();
      this.refreshSummaryPreview();
    }
  }

  triggerControlAt(i: number): FormControl<number> {
    return this.triggerRows.at(i);
  }

  private rebuildIndices(): void {
    this.rowSource.set(this.triggerRows.controls.map((_, i) => i));
  }

  private readTriggerValues(): number[] {
    return this.triggerRows.controls.map(c => Number(c.value));
  }

  /** Min for row `i` from predecessor (used for validators and HTML hints). */
  private minAllowedAtRow(i: number): number {
    if (i <= 0) return 1;
    const pv = Math.floor(Number(this.triggerRows.at(i - 1)!.value));
    const base = Number.isFinite(pv) ? pv : 1;
    return Math.max(1, base);
  }

  /** Sets per-row validators; does not coerce values (coercion happens on blur / save). */
  private setTriggerValidatorsFromRows(): void {
    for (let i = 0; i < this.triggerRows.length; i++) {
      const minV = this.minAllowedAtRow(i);
      this.triggerRows.at(i)!.setValidators([
        Validators.required,
        Validators.min(minV),
      ]);
      this.triggerRows.at(i)!.updateValueAndValidity({ emitEvent: false });
    }
  }

  /**
   * Forward pass from `startRow`: coerce each row to ≥ previous.
   * `normalizeEmpty`: on blur/save fill cleared/invalid fields with lawful min for that row.
   */
  private clampTriggersFromRow(startRow: number, opts: { normalizeEmpty: boolean }): void {
    if (this.triggerRows.length === 0) {
      return;
    }
    const from = Math.max(0, Math.min(startRow, this.triggerRows.length - 1));
    for (let i = from; i < this.triggerRows.length; i++) {
      const minV =
        i === 0
          ? 1
          : (() => {
              const p = Math.floor(Number(this.triggerRows.at(i - 1)!.value));
              const base = Number.isFinite(p) ? p : 1;
              return Math.max(1, base);
            })();
      const c = this.triggerRows.at(i)!;
      const raw = Number(c.value);
      if (!Number.isFinite(raw)) {
        if (opts.normalizeEmpty) {
          c.setValue(minV, { emitEvent: false });
        }
        continue;
      }
      let v = Math.floor(Math.max(raw, minV));
      if (Number(c.value) !== v) {
        c.setValue(v, { emitEvent: false });
      }
    }
  }

  private refreshSummaryPreview(): void {
    const raw = this.readTriggerValues().filter(v => Number.isFinite(v));
    this.summaryText.set(formatDiscardScheduleSummary(raw));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  save(): void {
    this.errorText.set('');
    this.clampTriggersFromRow(0, { normalizeEmpty: true });
    this.setTriggerValidatorsFromRows();
    this.triggerRows.updateValueAndValidity({ emitEvent: false });

    if (!this.triggerRows.valid || this.triggerRows.controls.some(c => !Number.isFinite(Number(c.value)))) {
      this.errorText.set('Enter a race number on every row, or remove extras.');
      return;
    }

    const triggers = this.readTriggerValues();
    const seqIssues = validateDiscardRaceSequence(triggers);
    if (seqIssues.length > 0) {
      const f = seqIssues[0]!;
      this.errorText.set(`Row ${f.raceIndex}: ${f.message}`);
      return;
    }

    this.dialogRef.close(triggers);
  }
}
