import { MatDialogRef as MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-message-dialog',
    template: `
        <h2 mat-dialog-title>{{ title }}</h2>
        <p mat-dialog-content>{{ message }}</p>
        <mat-dialog-actions align="end">
            <button type="button" matButton="filled" (click)="dialogRef.close(true)">OK</button>
        </mat-dialog-actions>
    `,
    imports: [MatDialogModule, MatButtonModule]
})
export class MessageDialog {
    public dialogRef = inject<MatDialogRef<MessageDialog>>(MatDialogRef<MessageDialog>);
    public title: string | undefined;
    public message: string | undefined;
}
