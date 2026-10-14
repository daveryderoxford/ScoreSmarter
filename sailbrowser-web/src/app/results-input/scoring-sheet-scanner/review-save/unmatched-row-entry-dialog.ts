import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { HelmNameAutocomplete } from 'app/boats/presentation/helm-name-autocomplete';
import { MatInputModule } from '@angular/material/input';
import { ClubStore } from 'app/club-tenant';
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';

export interface UnmatchedRowEntryDialogData {
  boatClass: string;
  sailNumber: string;
}

export interface UnmatchedRowEntryDialogResult {
  helm: string;
  crew?: string;
}

/** Collects helm/crew for a new entry. The entry is created when the scan is saved. */
@Component({
  selector: 'app-unmatched-row-entry-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    HelmNameAutocomplete,
  ],
  template: `
    <h2 mat-dialog-title>Add race entry</h2>
    <mat-dialog-content>
      <p class="hint">
        New entry for <strong>{{ data.boatClass }} #{{ data.sailNumber }}</strong>
        from the scanned row. It is created when you save the scan.
      </p>
      <form [formGroup]="form" class="entry-form" (ngSubmit)="addEntry()">
        <mat-form-field class="field">
          <mat-label>Helm</mat-label>
          <input
            matInput
            formControlName="helm"
            autocomplete="off"
            [matAutocomplete]="helmAutocomplete.panel()" />
          <app-helm-name-autocomplete
            #helmAutocomplete
            [control]="form.controls.helm" />
          <mat-error>Helm is required</mat-error>
        </mat-form-field>
        @if (!isSinglehander()) {
        <mat-form-field class="field">
          <mat-label>Crew (optional)</mat-label>
          <input matInput formControlName="crew" autocomplete="off" />
        </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="dialogRef.close()">
        Cancel
      </button>
      <button
        matButton="filled"
        type="button"
        (click)="addEntry()"
        [disabled]="form.invalid">
        Add entry
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 360px;
    }
    .hint {
      margin: 0 0 16px;
      font-size: 0.875rem;
      line-height: 1.4;
    }
    .entry-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .field {
      width: 100%;
    }
  `],
})
export class UnmatchedRowEntryDialog {
  protected readonly data = inject<UnmatchedRowEntryDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<UnmatchedRowEntryDialog, UnmatchedRowEntryDialogResult | undefined>);
  private readonly fb = inject(FormBuilder);
  private readonly clubStore = inject(ClubStore);

  protected readonly isSinglehander = computed(() =>
    isSinglehanderClass(this.data.boatClass, this.clubStore.club().classes),
  );

  protected readonly form = this.fb.nonNullable.group({
    helm: ['', Validators.required],
    crew: [''],
  });

  protected addEntry(): void {
    if (this.form.invalid) return;
    const helm = this.form.controls.helm.value.trim();
    if (!helm) return;
    const crew = this.isSinglehander()
      ? undefined
      : (this.form.controls.crew.value.trim() || undefined);
    this.dialogRef.close({ helm, crew });
  }
}
