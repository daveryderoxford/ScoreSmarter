import { Component, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';

export interface DeleteEntryRaceRow {
  competitorId: string;
  raceLabel: string;
  finished: boolean;
}

@Component({
  selector: 'app-delete-entry-dialog',
  imports: [MatDialogModule, MatDividerModule, MatButtonModule, MatListModule],
  template: `
    <h3 mat-dialog-title>Delete entries</h3>
    <div mat-dialog-content class="dialog-content">
      <p>Select races to remove <strong>{{ boatLabel() }}</strong> from. Races with a finish time cannot be deleted.</p>
      <mat-selection-list
        class="race-list"
        [multiple]="true"
        (selectionChange)="onSelectionChange($event)"
      >
        @for (row of races(); track row.competitorId) {
          <mat-list-option
            [value]="row.competitorId"
            [disabled]="row.finished"
            togglePosition="before"
          >
            <span matListItemTitle>{{ row.raceLabel }}</span>
            @if (row.finished) {
              <span matListItemLine class="finished">Finished — cannot delete</span>
            }
          </mat-list-option>
        }
      </mat-selection-list>
    </div>
    <mat-divider />
    <div mat-dialog-actions align="end">
      <button type="button" matButton="text" (click)="dialogRef.close()">Cancel</button>
      <button
        type="button"
        matButton="filled"
        [disabled]="selected().size === 0"
        (click)="confirm()"
      >
        Delete selected
      </button>
    </div>
  `,
  styles: [`
    .dialog-content {
      min-width: 320px;
      max-width: 480px;
    }
    .race-list {
      max-height: 50vh;
      overflow-y: auto;
    }
    .finished {
      font-style: italic;
      opacity: 0.75;
    }
  `],
})
export class DeleteEntryDialog {
  protected readonly dialogRef = inject(MatDialogRef);

  readonly boatLabel = input.required<string>();
  readonly races = input.required<DeleteEntryRaceRow[]>();
  readonly delete = output<string[]>();

  readonly selected = signal(new Set<string>());

  onSelectionChange(event: MatSelectionListChange): void {
    const ids = event.source.selectedOptions.selected.map(opt => opt.value as string);
    this.selected.set(new Set(ids));
  }

  confirm(): void {
    this.delete.emit([...this.selected()]);
    this.dialogRef.close();
  }
}
