import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { Boat } from 'app/boats';

export interface BoatsDupDialogData {
  boat: Boat;
  possibleDuplicates: Boat[];
}

@Component({
  selector: 'app-boats-duplicate-dialog',
  template: `
    <h2 mat-dialog-title>Possible duplicate</h2>
    <mat-dialog-content class="dialog-content-scroll">
        <p>{{ data.possibleDuplicates.length }} other helms exist for {{data.boat.boatClass}} {{data.boat.sailNumber}}
      </p>
      <mat-list>
         @for (boat of data.possibleDuplicates; track boat.id) {
           <mat-list-item>
               <span matListItem>{{boat.helm}}</span>
           </mat-list-item>
         }
      </mat-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [mat-dialog-close]="false">Cancel</button>
      <button matButton="filled" [mat-dialog-close]="true">Save boat</button>
    </mat-dialog-actions>
  `,
  styles: [],
  imports: [MatDialogModule, MatListModule, MatButtonModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoatsDuplicatesDialog {
  private dialogRef = inject(MatDialogRef<BoatsDuplicatesDialog>);
  protected data = inject<BoatsDupDialogData>(MAT_DIALOG_DATA);
}