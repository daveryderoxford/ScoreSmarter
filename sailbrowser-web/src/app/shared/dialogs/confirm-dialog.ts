import { MatDialogRef as MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-confirm-dialog',
    template: `
        <h2 mat-dialog-title>{{ title }}</h2>
        <p mat-dialog-content>{{ message }}</p>
        <mat-dialog-actions align="end">
            <button type="button" matButton (click)="dialogRef.close(false)">{{ cancelLabel }}</button>
            <button type="button" matButton="filled" (click)="dialogRef.close(true)">{{ confirmLabel }}</button>
        </mat-dialog-actions>
    `,
    imports: [MatDialogModule, MatButtonModule]
})
export class ConfirmDialog {
    dialogRef = inject<MatDialogRef<ConfirmDialog>>(MatDialogRef);

    public title = '';
    public message = '';
    public confirmLabel = 'OK';
    public cancelLabel = 'Cancel';
}
