import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';

export interface UnsavedChangesDialogData {
  title?: string;
  message?: string;
}

const DEFAULT_TITLE = 'Save changes?';
const DEFAULT_MESSAGE = 'You have unsaved changes. Save them before continuing?';

@Component({
  selector: 'app-unsaved-changes-dialog',
  template: `
    <h2 mat-dialog-title>{{ title() }}</h2>
    <p mat-dialog-content>{{ message() }}</p>
    <mat-dialog-actions align="end">
      <button type="button" matButton (click)="dialogRef.close('cancel')">Keep editing</button>
      <button type="button" matButton (click)="dialogRef.close('discard')">Discard changes</button>
      <button type="button" matButton="filled" (click)="dialogRef.close('save')">Save changes</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
})
export class UnsavedChangesDialog {
  protected readonly dialogRef =
    inject<MatDialogRef<UnsavedChangesDialog, UnsavedChangesChoice>>(MatDialogRef);

  private readonly data = inject<UnsavedChangesDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  readonly title = signal(this.data?.title ?? DEFAULT_TITLE);
  readonly message = signal(this.data?.message ?? DEFAULT_MESSAGE);
}
