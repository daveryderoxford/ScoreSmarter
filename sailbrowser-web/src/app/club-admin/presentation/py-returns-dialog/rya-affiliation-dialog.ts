import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';

/** Edits the club's RYA affiliation ID; closes with the new ID, or undefined on cancel. */
@Component({
  selector: 'app-rya-affiliation-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>RYA affiliation ID</h2>
    <mat-dialog-content>
      <mat-form-field class="field">
        <mat-label>RYA affiliation ID</mat-label>
        <input matInput [formControl]="id" autocomplete="off" (keydown.enter)="save()" cdkFocusInitial>
        <mat-hint>The club's RYA affiliation number</mat-hint>
        <mat-error>Affiliation ID is required</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" (click)="save()" [disabled]="id.invalid">Save</button>
    </mat-dialog-actions>
  `,
  styles: `.field { width: 100%; min-width: min(320px, 80vw); }`,
})
export class RyaAffiliationDialog {
  private readonly dialogRef = inject(MatDialogRef<RyaAffiliationDialog, string>);
  protected readonly id = new FormControl(inject<string>(MAT_DIALOG_DATA) ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });

  protected save(): void {
    if (this.id.invalid) return;
    this.dialogRef.close(normaliseWhitespace(this.id.value));
  }
}
