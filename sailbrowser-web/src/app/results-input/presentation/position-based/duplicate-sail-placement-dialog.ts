import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export type DuplicateSailPlacementChoice = 'tie' | 'next' | 'cancel';

export interface DuplicateSailPlacementDialogData {
  sailNumber: number;
  existingHelm: string;
  existingBoatClass: string;
  existingRankLabel: string;
  newHelm: string;
  newBoatClass: string;
}

@Component({
  selector: 'app-duplicate-sail-placement-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Sail number already in finish order</h2>
    <mat-dialog-content>
      <p>
        Sail <strong>{{ data.sailNumber }}</strong> is already placed at
        <strong>{{ data.existingRankLabel }}</strong>
        ({{ data.existingHelm }}, {{ data.existingBoatClass }}).
      </p>
      <p>
        You are adding <strong>{{ data.newHelm }}</strong> ({{ data.newBoatClass }}).
        How should this entry be placed?
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close('cancel')">Cancel</button>
      <button mat-button type="button" (click)="close('next')">Add as next finisher</button>
      <button matButton="filled" type="button" (click)="close('tie')">Tie with existing position</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      mat-dialog-content p {
        margin: 0 0 0.75rem;
      }
      mat-dialog-content p:last-child {
        margin-bottom: 0;
      }
    `,
  ],
})
export class DuplicateSailPlacementDialog {
  readonly data = inject<DuplicateSailPlacementDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DuplicateSailPlacementDialog, DuplicateSailPlacementChoice>);

  close(choice: DuplicateSailPlacementChoice): void {
    this.dialogRef.close(choice);
  }
}
