import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Race } from 'app/race-calender/model/race';
import { RaceResultDraft } from 'app/results-input/model/race-result-draft';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import {
  RaceCompetitorEditService,
  RaceResultDataCommand,
} from '../../services/race-competitor-edit.service';
import { RaceResultDataForm } from './race-result-data-form';

export interface RaceResultDataDialogData {
  competitor: ResolvedRaceCompetitor;
  race: Race;
  draft?: RaceResultDraft;
}

@Component({
  selector: 'app-race-result-data-dialog',
  imports: [MatDialogModule, MatButtonModule, RaceResultDataForm],
  template: `
    <h3 mat-dialog-title>Edit Race Result</h3>
    <mat-dialog-content>
      <app-race-result-data-form
        [competitor]="data.competitor"
        [race]="data.race"
        [draft]="data.draft"
        (submitCommand)="onSubmit($event)"
        (cancelled)="dialogRef.close()"
      />
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
export class RaceResultDataDialog {
  readonly dialogRef = inject(MatDialogRef<RaceResultDataDialog, boolean | undefined>);
  protected readonly data = inject<RaceResultDataDialogData>(MAT_DIALOG_DATA);
  private readonly editService = inject(RaceCompetitorEditService);

  protected readonly errorMessage = signal<string | undefined>(undefined);

  async onSubmit(command: RaceResultDataCommand): Promise<void> {
    this.errorMessage.set(undefined);
    try {
      await this.editService.applyRaceResultData(command);
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
