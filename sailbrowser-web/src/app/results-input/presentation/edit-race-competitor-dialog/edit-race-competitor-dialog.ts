import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RaceCalendarStore } from 'app/race-calender';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import {
  RaceCompetitorEditService,
  SeriesEntryEditCommand,
} from '../../services/race-competitor-edit.service';
import { SeriesEntryEditForm } from '../series-entry-edit-form/series-entry-edit-form';
import { BusyButton } from "app/shared/components/busy-button";
import { DeleteButton } from "app/shared/components/delete-button";

export interface EditRaceCompetitorDialogData {
  /** The race row being edited - identity comes from its SeriesEntry. */
  competitor: ResolvedRaceCompetitor;
}

/**
 * Result of the correction dialog. Callers rarely need to inspect this; the
 * dialog itself has already applied the change by the time it closes with
 * `saved` or `deleted`. `undefined` is returned when the user cancels or
 * dismisses without committing.
 */
export type EditRaceCompetitorDialogResult =
  | { kind: 'saved' }
  | { kind: 'deleted' }
  | undefined;

/**
 * Correction dialog for a single race competitor (post-entry typo fixes).
 *
 * Hosts `SeriesEntryEditForm` for the main edit flow and exposes a separate
 * Delete action with a confirm step. The dialog owns the
 * `RaceCompetitorEditService.applyEdit` call so a collision error can be
 * surfaced in-place without closing the form.
 */
@Component({
  selector: 'app-edit-race-competitor-dialog',
  imports: [MatDialogModule, MatButtonModule, SeriesEntryEditForm, BusyButton, DeleteButton],
  template: `
    <h3 mat-dialog-title>Edit competitor</h3>
    <mat-dialog-content>
      @if (series(); as s) {
        <app-series-entry-edit-form
          [competitor]="data.competitor"
          [series]="s"
          (submitCommand)="onSubmit($event)"
          (cancelled)="dialogRef.close()"
        />
      } @else {
        <p class="warn">Series not loaded - cannot edit this row.</p>
      }

      @if (errorMessage(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="start">
      <app-delete-button [busy]="saving()" (delete)="onDelete()">
        Delete competitor
      </app-delete-button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host { display: block; max-width: 100%; }
    .error { color: var(--mat-sys-error); margin: 4px 0 0; font-size: 12px; }
    .warn { color: var(--mat-sys-error); }
    mat-dialog-actions {
      border-top: 1px solid var(--mat-sys-outline-variant);
      margin-top: 8px;
      padding-top: 8px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditRaceCompetitorDialog {
  readonly dialogRef = inject(MatDialogRef<EditRaceCompetitorDialog, EditRaceCompetitorDialogResult>);
  protected readonly data = inject<EditRaceCompetitorDialogData>(MAT_DIALOG_DATA);
  private readonly editService = inject(RaceCompetitorEditService);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly dialogs = inject(DialogsService);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | undefined>(undefined);

  protected readonly series = computed(() =>
    this.raceCalendar.allSeries().find(s => s.id === this.data.competitor.seriesId),
  );

  async onSubmit(command: SeriesEntryEditCommand): Promise<void> {
    this.errorMessage.set(undefined);
    this.saving.set(true);
    try {
      await this.editService.applyEdit(command);
      this.dialogRef.close({ kind: 'saved' });
    } catch (err) {
      // Keep the dialog open on a collision so the user can adjust the
      // field that caused it; other errors still surface the same way.
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

  async onDelete(): Promise<void> {
    const ok = await this.dialogs.confirm(
      'Delete competitor',
      `Remove ${this.data.competitor.helm} from this race?`,
    );
    if (!ok) return;
    this.saving.set(true);
    try {
      await this.editService.apply({
        competitorId: this.data.competitor.id,
        operation: { type: 'deleteCompetitor' },
      });
      this.dialogRef.close({ kind: 'deleted' });
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      this.saving.set(false);
    }
  }
}
