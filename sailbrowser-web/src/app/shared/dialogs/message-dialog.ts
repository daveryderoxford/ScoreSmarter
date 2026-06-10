import { MatDialogRef as MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

@Component({
    selector: 'app-message-dialog',
    template: `
        <h3 mat-dialog-title>{{ title }}</h3>
        <p mat-dialog-content>{{ message }}</p>
        <mat-divider  />
        <div mat-dialog-actions>
        <button type="button" mat-raised-button
            (click)="dialogRef.close(true)">OK</button>
        </div>
    `,
    imports: [MatDialogModule, MatDividerModule, MatButtonModule]
})
export class MessageDialog {
    public dialogRef = inject<MatDialogRef<MessageDialog>>(MatDialogRef<MessageDialog>);
    public title: string | undefined;
    public message: string | undefined;
}

