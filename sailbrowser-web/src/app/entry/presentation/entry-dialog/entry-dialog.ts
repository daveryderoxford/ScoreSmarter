import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { EntryWizard, type EntryWizardResult } from '../entry-wizard/entry-wizard';

export interface EntryDialogData {
  /** Race to pre-select on the race step. */
  raceId?: string;
  /** Seeds the boat search, e.g. a sail number the race officer could not match. */
  initialSearch?: string;
  /** Enter as Officer of the Day for this duty member. */
  oodHelm?: string;
}

export type EntryDialogResult = EntryWizardResult;

@Component({
  selector: 'app-entry-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, EntryWizard],
  template: `
    <div class="title-row">
      <h2 mat-dialog-title>{{ data.oodHelm !== undefined ? 'Enter as OOD' : 'Add entry' }}</h2>
      <button mat-icon-button type="button" aria-label="Close" (click)="requestClose()">
        <mat-icon>close</mat-icon>
      </button>
    </div>
    <mat-dialog-content>
      <app-entry-wizard
        [scopedRaceId]="data.raceId"
        [initialSearch]="data.initialSearch"
        [oodHelm]="data.oodHelm"
        (entered)="dialogRef.close($event)" />
    </mat-dialog-content>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-right: 8px;
    }
    mat-dialog-content {
      flex: 1 1 auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryDialog {
  protected readonly dialogRef = inject<MatDialogRef<EntryDialog, EntryDialogResult>>(MatDialogRef);
  protected readonly data = inject<EntryDialogData>(MAT_DIALOG_DATA);
  private readonly dialogs = inject(DialogsService);
  private readonly wizard = viewChild.required(EntryWizard);

  constructor() {
    this.dialogRef
      .backdropClick()
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.requestClose());
    this.dialogRef
      .keydownEvents()
      .pipe(takeUntilDestroyed())
      .subscribe(event => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          void this.requestClose();
        }
      });
  }

  async requestClose(): Promise<void> {
    if (this.wizard().isDirty()) {
      const discard = await this.dialogs.confirm('Discard entry?', 'This entry has not been saved.', {
        confirm: 'Discard',
        cancel: 'Keep editing',
      });
      if (!discard) return;
    }
    this.dialogRef.close();
  }
}

/** Opens the entry dialog; full screen when `fullScreen` (phones). */
export function openEntryDialog(
  dialog: MatDialog,
  data: EntryDialogData,
  fullScreen: boolean,
): MatDialogRef<EntryDialog, EntryDialogResult> {
  const size = fullScreen
    ? { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh' }
    : { width: 'min(96vw, 520px)', maxWidth: '96vw', maxHeight: '90vh' };
  return dialog.open<EntryDialog, EntryDialogData, EntryDialogResult>(EntryDialog, {
    ...size,
    data,
    disableClose: true,
  });
}
