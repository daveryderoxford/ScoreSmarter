import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RaceCalendarStore } from 'app/race-calender';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import {
  RaceCompetitorEditService,
  SeriesTypoEditCommand,
} from '../../services/race-competitor-edit.service';
import { SeriesEditForm } from './series-edit-form';

export interface SeriesEditDialogData {
  competitor: ResolvedRaceCompetitor;
}

@Component({
  selector: 'app-series-edit-dialog',
  imports: [MatDialogModule, MatButtonModule, SeriesEditForm],
  template: `
    <h3 mat-dialog-title>Correct series data</h3>
    <mat-dialog-content>
      @if (series()) {
        <app-series-edit-form
          [competitor]="data.competitor"
          [series]="series()!"
          (submitCommand)="onSubmit($event)"
          (cancelled)="dialogRef.close()"
        />
      } @else {
        <p class="error">Series not loaded.</p>
      }
      @if (errorMessage(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }
    </mat-dialog-content>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .error {
        color: var(--mat-sys-error);
        font-size: 12px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesEditDialog {
  readonly dialogRef = inject(MatDialogRef<SeriesEditDialog, boolean | undefined>);
  protected readonly data = inject<SeriesEditDialogData>(MAT_DIALOG_DATA);
  private readonly editService = inject(RaceCompetitorEditService);
  private readonly raceCalendar = inject(RaceCalendarStore);

  protected readonly errorMessage = signal<string | undefined>(undefined);

  protected readonly series = computed(() =>
    this.raceCalendar.allSeries().find(s => s.id === this.data.competitor.seriesId),
  );

  async onSubmit(command: SeriesTypoEditCommand): Promise<void> {
    this.errorMessage.set(undefined);
    try {
      await this.editService.applySeriesTypo(command);
      this.dialogRef.close(true);
    } catch (err) {
      const msg =
        err instanceof ScoreSmarterError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to save changes.';
      this.errorMessage.set(msg);
    }
  }
}
