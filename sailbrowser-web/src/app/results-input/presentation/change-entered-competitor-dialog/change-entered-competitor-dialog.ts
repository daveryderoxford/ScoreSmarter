import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RaceCalendarStore } from 'app/race-calender';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import {
  ChangeEnteredCompetitorCommand,
  RaceCompetitorEditService,
} from '../../services/race-competitor-edit.service';
import { ChangeEnteredCompetitorForm } from './change-entered-competitor-form';

export interface ChangeEnteredCompetitorDialogData {
  competitor: ResolvedRaceCompetitor;
}

@Component({
  selector: 'app-change-entered-competitor-dialog',
  imports: [MatDialogModule, MatButtonModule, ChangeEnteredCompetitorForm],
  template: `
    <h3 mat-dialog-title>Change Race Entry</h3>
    <mat-dialog-content>
      @if (series()) {
        <app-change-entered-competitor-form
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
  styles: [`:host { display: block; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeEnteredCompetitorDialog {
  readonly dialogRef = inject(MatDialogRef<ChangeEnteredCompetitorDialog, boolean | undefined>);
  protected readonly data = inject<ChangeEnteredCompetitorDialogData>(MAT_DIALOG_DATA);
  private readonly editService = inject(RaceCompetitorEditService);
  private readonly raceCalendar = inject(RaceCalendarStore);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | undefined>(undefined);

  protected readonly series = computed(() =>
    this.raceCalendar.allSeries().find(s => s.id === this.data.competitor.seriesId),
  );

  async onSubmit(command: ChangeEnteredCompetitorCommand): Promise<void> {
    this.errorMessage.set(undefined);
    this.saving.set(true);
    try {
      await this.editService.applyChangeEnteredCompetitor(command);
      this.dialogRef.close(true);
    } catch (err) {
      const msg =
        err instanceof ScoreSmarterError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to save changes.';
      this.errorMessage.set(msg);
    } finally {
      this.saving.set(false);
    }
  }
}
