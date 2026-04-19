import { MatDialog as MatDialog, MatDialogRef as MatDialogRef } from '@angular/material/dialog';

import { ConfirmDialog } from './confirm-dialog';
import {
  EntryConflictChoice,
  EntryConflictDialog,
  EntryConflictSummary,
} from './entry-conflict-dialog';
import { MessageDialog } from "./message-dialog";
import { UnsavedChangesChoice, UnsavedChangesDialog } from './unsaved-changes-dialog';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, lastValueFrom } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class DialogsService {
    private dialog = inject(MatDialog);

    public async confirm(title: string, message: string): Promise<boolean> {

        let dialogRef: MatDialogRef<ConfirmDialog>;

        dialogRef = this.dialog.open(ConfirmDialog);

        dialogRef.componentInstance.title = title;
        dialogRef.componentInstance.message = message;

        return lastValueFrom(dialogRef.afterClosed());
    }

    public async message(title: string, message: string): Promise<boolean> {

        let dialogRef: MatDialogRef<MessageDialog>;

        dialogRef = this.dialog.open(MessageDialog);

        dialogRef.componentInstance.title = title;
        dialogRef.componentInstance.message = message;

        return firstValueFrom(dialogRef.afterClosed());
    }

    public async promptEntryConflict(
        conflicts: EntryConflictSummary[],
    ): Promise<EntryConflictChoice> {
        const dialogRef = this.dialog.open<EntryConflictDialog, void, EntryConflictChoice>(
            EntryConflictDialog,
        );
        dialogRef.componentInstance.conflicts = conflicts;
        const result = await firstValueFrom(dialogRef.afterClosed());
        return result ?? 'cancel';
    }

    public async promptUnsavedChanges(
        title = 'Unsaved changes',
        message = 'Save your edits before switching?'
    ): Promise<UnsavedChangesChoice> {
        let dialogRef: MatDialogRef<UnsavedChangesDialog, UnsavedChangesChoice>;
        dialogRef = this.dialog.open(UnsavedChangesDialog);
        dialogRef.componentInstance.title = title;
        dialogRef.componentInstance.message = message;
        const result = await firstValueFrom(dialogRef.afterClosed());
        return result ?? 'cancel';
    }
}
