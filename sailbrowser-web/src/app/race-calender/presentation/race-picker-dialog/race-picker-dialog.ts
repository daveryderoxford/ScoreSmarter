import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RaceCalendarStore } from '../../services/full-race-calander';
import { RacesPanel } from '../races-panel/races-panel';
import type { RacesPanelFilter } from '../races-panel/races-panel-utils';

export interface RacePickerDialogData {
  title: string;
  /** Ids selected when the dialog opens. */
  preselectedRaceIds?: string[];
  /** At most this many races (e.g. `1` for scoring sheet). Omit for unlimited. */
  maxSelections?: number;
  /** If true (default), OK stays disabled until at least one race is selected. */
  requireSelection?: boolean;
  /**
   * Which filter chips the panel should expose. When omitted the panel shows
   * its full default set (past, future, hide completed).
   */
  availableFilters?: readonly RacesPanelFilter[];
}

@Component({
  selector: 'app-race-picker-dialog',
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content class="picker-content">
      <app-races-panel
        [races]="races()"
        [selectedRaceIds]="selectedIds()"
        [maxSelections]="maxSelections"
        [availableFilters]="availableFilters()"
        (selectedRaceIdsChange)="selectedIds.set($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">Cancel</button>
      <button matButton="filled" type="button" [disabled]="!canConfirm()" (click)="confirm()">
        OK
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .picker-content {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: min(60vh, 520px);
      min-width: min(92vw, 420px);
      overflow: hidden;
    }
  `,
  imports: [
    MatDialogModule,
    MatButtonModule,
    RacesPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacePickerDialog {
  protected readonly data = inject<RacePickerDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RacePickerDialog, string[] | undefined>);
  protected readonly raceStore = inject(RaceCalendarStore);
  protected readonly maxSelections = this.data.maxSelections;
  private readonly requireSelection = this.data.requireSelection ?? true;

  protected readonly selectedIds = signal<string[]>(this.data.preselectedRaceIds?.filter(Boolean) ?? []);
  protected readonly races = computed(() => this.raceStore.allRaces());
  protected readonly availableFilters = computed<readonly RacesPanelFilter[]>(
    () => this.data.availableFilters ?? ['past', 'future', 'hideCompleted'],
  );

  protected canConfirm(): boolean {
    if (!this.requireSelection) {
      return true;
    }
    return this.selectedIds().length > 0;
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }

  protected confirm(): void {
    if (!this.canConfirm()) {
      return;
    }
    this.dialogRef.close(this.selectedIds());
  }
}
