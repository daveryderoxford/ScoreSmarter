import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';

export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';

@Component({
  selector: 'app-unsaved-changes-dialog',
  template: `
    <h3 mat-dialog-title>{{ title }}</h3>
    <p mat-dialog-content>{{ message }}</p>
    <mat-divider />
    <div mat-dialog-actions>
      <button type="button" mat-raised-button (click)="dialogRef.close('save')">Save</button>
      <button type="button" mat-button (click)="dialogRef.close('discard')">Discard</button>
      <button type="button" mat-button (click)="dialogRef.close('cancel')">Cancel</button>
    </div>
  `,
  imports: [MatDialogModule, MatDividerModule, MatButtonModule],
})
export class UnsavedChangesDialog {
  dialogRef = inject<MatDialogRef<UnsavedChangesDialog, UnsavedChangesChoice>>(MatDialogRef);

  title = 'Unsaved changes';
  message = 'Save your edits before switching competitor?';
}
