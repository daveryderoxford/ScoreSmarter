import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { helmNamesEqual } from 'app/boats/model/helm-name';
import { isValidSailNumber, normalizeSailNumber } from 'app/boats/model/sail-number';
import { SailNumberInput } from 'app/boats/presentation/sail-number-input';
import { BoatsStore } from 'app/boats/services/boats.store';
import { ClubStore } from 'app/club-tenant';
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';
import { normaliseString } from 'app/shared/utils/string-utils';

/** What already exists for a class and sail number. */
export interface ScanRowLookup {
  /** Helm of the race entry with this class and sail number. */
  enteredAs?: string;
  candidates: { helm: string; source: 'series-entry' | 'boat' }[];
}

export interface ScanRowEditDialogData {
  rowIndex: number;
  boatClass?: string;
  sailNumber?: string;
  helm?: string;
  classes: string[];
  lookup: (boatClass: string, sailNumber: string) => ScanRowLookup;
}

export interface ScanRowEditDialogResult {
  boatClass: string;
  sailNumber: string;
  helm: string;
  crew?: string;
}

const MAX_HELM_SUGGESTIONS = 20;

/** Corrects a scanned row's class, sail number and helm. Nothing is written until the scan is saved. */
@Component({
  selector: 'app-scan-row-edit-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    SailNumberInput,
  ],
  template: `
    <h2 mat-dialog-title>Edit row {{ data.rowIndex }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="edit-form" (ngSubmit)="save()">
        <mat-form-field class="field">
          <mat-label>Class</mat-label>
          <mat-select formControlName="boatClass">
            @for (name of data.classes; track name) {
              <mat-option [value]="name">{{ name }}</mat-option>
            }
          </mat-select>
          <mat-error>Class is required</mat-error>
        </mat-form-field>
        <mat-form-field class="field">
          <mat-label>Sail number</mat-label>
          <app-sail-number-input formControlName="sailNumber" />
          <mat-error>Sail number is required</mat-error>
        </mat-form-field>
        @if (status(); as text) {
          <p class="status" aria-live="polite">{{ text }}</p>
        }
        @if (!lookup().enteredAs) {
          <mat-form-field class="field">
            <mat-label>Helm</mat-label>
            <input matInput formControlName="helm" autocomplete="off" [matAutocomplete]="helmPanel" />
            <mat-autocomplete #helmPanel="matAutocomplete">
              @for (name of helmSuggestions(); track name) {
                <mat-option [value]="name">{{ name }}</mat-option>
              }
            </mat-autocomplete>
            <mat-error>Helm is required</mat-error>
          </mat-form-field>
          @if (showCrew()) {
            <mat-form-field class="field">
              <mat-label>Crew (optional)</mat-label>
              <input matInput formControlName="crew" autocomplete="off" />
            </mat-form-field>
          }
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="dialogRef.close()">Cancel</button>
      <button matButton="filled" type="button" (click)="save()" [disabled]="!canSave()">Update row</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: 360px;
    }
    .edit-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .field {
      width: 100%;
    }
    .status {
      margin: 0 0 8px;
      font-size: 0.875rem;
      line-height: 1.4;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ScanRowEditDialog {
  protected readonly data = inject<ScanRowEditDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<ScanRowEditDialog, ScanRowEditDialogResult | undefined>);
  private readonly fb = inject(FormBuilder);
  private readonly clubStore = inject(ClubStore);
  private readonly boatsStore = inject(BoatsStore);

  protected readonly form = this.fb.nonNullable.group({
    boatClass: [this.data.boatClass ?? '', Validators.required],
    sailNumber: [this.data.sailNumber ?? '', Validators.required],
    helm: [this.data.helm ?? ''],
    crew: [''],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  private readonly identity = computed(() => {
    const boatClass = this.value().boatClass ?? '';
    const sailNumber = normalizeSailNumber(this.value().sailNumber);
    return boatClass && isValidSailNumber(sailNumber) ? { boatClass, sailNumber } : null;
  });

  protected readonly lookup = computed<ScanRowLookup>(() => {
    const identity = this.identity();
    return identity ? this.data.lookup(identity.boatClass, identity.sailNumber) : { candidates: [] };
  });

  protected readonly status = computed(() => {
    if (!this.identity()) return '';
    const { enteredAs, candidates } = this.lookup();
    if (enteredAs) return `Entered in this race as ${enteredAs}. The row will be linked to this entry.`;
    if (candidates.length === 1) {
      const [only] = candidates;
      return only!.source === 'series-entry' ? `Series entry: ${only!.helm}` : `Boat register: ${only!.helm}`;
    }
    if (candidates.length > 1) {
      return `${candidates.length} helms sail this boat: ${candidates.map(c => c.helm).join(', ')}`;
    }
    return 'No entry found. A new entry will be created when you save the scan.';
  });

  protected readonly helmSuggestions = computed(() => {
    const term = normaliseString(this.value().helm);
    const candidates = this.lookup().candidates.map(c => c.helm);
    const others = this.boatsStore.uniqueHelmNames()
      .filter(name => !candidates.some(c => helmNamesEqual(c, name)))
      .filter(name => !term || normaliseString(name).includes(term));
    return [...candidates, ...others].slice(0, MAX_HELM_SUGGESTIONS);
  });

  protected readonly showCrew = computed(() =>
    !isSinglehanderClass(this.value().boatClass ?? '', this.clubStore.club().classes),
  );

  protected readonly canSave = computed(() =>
    !!this.identity() && (!!this.lookup().enteredAs || !!this.value().helm?.trim()),
  );

  protected save(): void {
    const identity = this.identity();
    if (!identity || !this.canSave()) return;
    const enteredAs = this.lookup().enteredAs;
    const crew = this.showCrew() ? this.form.controls.crew.value.trim() || undefined : undefined;
    this.dialogRef.close({
      ...identity,
      helm: enteredAs ?? this.form.controls.helm.value.trim(),
      ...(crew && !enteredAs ? { crew } : {}),
    });
  }
}
