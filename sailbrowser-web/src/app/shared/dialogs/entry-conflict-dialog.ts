import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';

export type EntryConflictChoice = 'swap' | 'cancel';

/** UI-facing summary of a single conflicting entry. The dialog deliberately
 *  knows nothing about Race/RaceCompetitor/SeriesEntry shapes so it can be
 *  reused outside the entry page if needed. */
export interface EntryConflictSummary {
  raceLabel: string;
  existingLabel: string;
  reasonLabel: string;
}

@Component({
  selector: 'app-entry-conflict-dialog',
  template: `
    <h3 mat-dialog-title>{{ title }}</h3>
    <div mat-dialog-content>
      <p>{{ intro }}</p>
      <mat-list dense>
        @for (c of conflicts; track c.raceLabel + c.existingLabel) {
          <mat-list-item>
            <span matListItemTitle>{{ c.raceLabel }}</span>
            <span matListItemLine>Already entered as {{ c.existingLabel }}</span>
            <span matListItemLine class="reason">{{ c.reasonLabel }}</span>
          </mat-list-item>
        }
      </mat-list>
      <p class="hint">
        Swap will remove the existing entry from the listed race(s) and
        replace it with the new boat. Other races for the existing entry are
        left unchanged.
      </p>
    </div>
    <mat-divider />
    <div mat-dialog-actions align="end">
      <button type="button" mat-button (click)="dialogRef.close('cancel')">
        Return to edit
      </button>
      <button
        type="button"
        mat-raised-button
        color="warn"
        (click)="dialogRef.close('swap')"
      >
        Swap boats
      </button>
    </div>
  `,
  styles: [`
    .reason { font-style: italic; opacity: 0.8; }
    .hint { margin-top: 1rem; opacity: 0.8; font-size: 0.9rem; }
  `],
  imports: [MatDialogModule, MatDividerModule, MatButtonModule, MatListModule],
})
export class EntryConflictDialog {
  dialogRef = inject<MatDialogRef<EntryConflictDialog, EntryConflictChoice>>(MatDialogRef);

  title = 'Entry already exists';
  intro = 'The following race(s) already have a conflicting entry:';
  conflicts: EntryConflictSummary[] = [];
}
