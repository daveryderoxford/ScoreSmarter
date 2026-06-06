import { MatDialog as MatDialog, MatDialogRef as MatDialogRef } from '@angular/material/dialog';

import { ConfirmDialog } from './confirm-dialog';
import {
  EntryConflictChoice,
  EntryConflictDialog,
  EntryConflictSummary,
} from './entry-conflict-dialog';
import { MessageDialog } from "./message-dialog";
import { UnsavedChangesChoice, UnsavedChangesDialog } from './unsaved-changes-dialog';
import {
  DiscardProfileDialogData,
  DiscardProfileEditDialog,
} from './discard-profile-edit-dialog';
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

    /** Opens the editor; resolves to stored **trigger** milestones (same as `Series.discards`), or undefined when cancelled. */
    public async editDiscardProfile(data: DiscardProfileDialogData): Promise<number[] | undefined> {
        const dialogRef = this.dialog.open(DiscardProfileEditDialog, {
            width: '560px',
            maxWidth: '95vw',
            data,
        });
        return await firstValueFrom(dialogRef.afterClosed());
    }

    public async promptUnsavedChanges(
        title = 'Unsaved changes',
        message = 'Save your edits before switching?'
    ): Promise<UnsavedChangesChoice> {
        const dialogRef = this.dialog.open(UnsavedChangesDialog, {
            data: { title, message },
        });
        const result = await firstValueFrom(dialogRef.afterClosed());
        return result ?? 'cancel';
    }
}
