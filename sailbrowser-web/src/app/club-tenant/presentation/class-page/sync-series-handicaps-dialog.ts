import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RaceCalendarStore } from 'app/race-calender/services/full-race-calander';
import type { SeriesEntryHandicapSyncPlan } from 'app/results-input/services/series-entry-handicap-sync';
import { SeriesEntryHandicapSyncService } from 'app/results-input/services/series-entry-handicap-sync.service';

export interface SyncSeriesHandicapsDialogData {
  /** Called after a successful apply so the host can show a snackbar. */
  onApplied?: (summary: SeriesEntryHandicapSyncPlan) => void;
}

@Component({
  selector: 'app-sync-series-handicaps-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Update series handicaps</h2>
    <mat-dialog-content>
      <p class="intro">
        Update handicaps for existing series entries to reflect 
        handicaps specified for the class. 
        Useful when the handicap for a class is updated and exisitng entries 
        need to be updated to reflect this/
      </p>

      <mat-form-field class="series-field">
        <mat-label>Series</mat-label>
        <mat-select [formControl]="seriesControl">
          @for (s of seriesOptions(); track s.id) {
            <mat-option [value]="s.id">{{ s.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (preview(); as p) {
        <div class="preview" role="status">
          <p>Update <strong>{{ p.updated.length }}</strong> entries;
            {{ p.unchanged }} unchanged;
            {{ p.skippedUnknownClass }} skipped (unknown class).</p>
          @if (p.unknownClassNames.length > 0) {
            <p class="skipped">Skipped classes: {{ p.unknownClassNames.join(', ') }}</p>
          }
        </div>
      }

      @if (errorMessage()) {
        <p class="error">{{ errorMessage() }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton type="button" [disabled]="busy()" (click)="cancel()">Cancel</button>
      <button
        matButton="tonal"
        type="button"
        [disabled]="busy() || seriesControl.invalid"
        (click)="previewSync()">
        @if (busy() && !applied()) {
          <mat-spinner diameter="18" />
        } @else {
          Preview
        }
      </button>
      <button
        matButton="tonal"
        type="button"
        [disabled]="busy() || !canApply()"
        (click)="applySync()">
        @if (busy() && applied()) {
          <mat-spinner diameter="18" />
        } @else {
          Apply
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 360px;
      max-width: 480px;
    }
    .intro {
      margin: 0 0 16px;
      font-size: 0.875rem;
      line-height: 1.4;
    }
    .series-field {
      width: 100%;
    }
    .preview {
      margin-top: 12px;
      padding: 12px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container);
      font-size: 0.875rem;
    }
    .preview p {
      margin: 0 0 8px;
    }
    .preview p:last-child {
      margin-bottom: 0;
    }
    .skipped {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
      margin-top: 12px;
    }
    mat-dialog-actions button mat-spinner {
      display: inline-block;
      vertical-align: middle;
    }
  `],
})
export class SyncSeriesHandicapsDialog {
  private readonly data = inject<SyncSeriesHandicapsDialogData>(MAT_DIALOG_DATA, { optional: true });
  private readonly dialogRef = inject(MatDialogRef<SyncSeriesHandicapsDialog, boolean | undefined>);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly syncService = inject(SeriesEntryHandicapSyncService);

  protected readonly seriesControl = new FormControl<string>('', { nonNullable: true, validators: Validators.required });
  protected readonly seriesOptions = computed(() => this.raceCalendar.allSeries());
  protected readonly preview = signal<SeriesEntryHandicapSyncPlan | null>(null);
  protected readonly busy = signal(false);
  protected readonly applied = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly canApply = computed(() => this.preview() !== null && !this.busy());

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }

  protected async previewSync(): Promise<void> {
    const seriesId = this.seriesControl.value;
    if (!seriesId) return;

    this.busy.set(true);
    this.applied.set(false);
    this.errorMessage.set(null);
    this.preview.set(null);

    try {
      const plan = await this.syncService.plan(seriesId);
      if (!plan) {
        this.errorMessage.set('Series not found.');
        return;
      }
      this.preview.set(plan);
    } catch (err) {
      console.error(err);
      this.errorMessage.set('Preview failed. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async applySync(): Promise<void> {
    const seriesId = this.seriesControl.value;
    const existingPreview = this.preview();
    if (!seriesId || !existingPreview) return;

    this.busy.set(true);
    this.applied.set(true);
    this.errorMessage.set(null);

    try {
      const plan = await this.syncService.apply(seriesId);
      if (!plan) {
        this.errorMessage.set('Series not found.');
        return;
      }
      this.preview.set(plan);
      this.data?.onApplied?.(plan);
      this.dialogRef.close(true);
    } catch (err) {
      console.error(err);
      this.errorMessage.set('Apply failed. Please try again.');
    } finally {
      this.busy.set(false);
      this.applied.set(false);
    }
  }
}
