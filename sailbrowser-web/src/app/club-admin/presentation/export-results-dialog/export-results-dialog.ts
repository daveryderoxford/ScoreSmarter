import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { SeriesInfo } from 'app/published-results/model/published-season';
import { PublishedSeriesPicker } from 'app/published-results/presentation/published-series-picker/published-series-picker';
import {
  buildPublishedResultsCsv,
  type PublishedSeriesExportChunk,
} from 'app/published-results/services/published-results-csv';
import { PublishedResultsReader } from 'app/published-results/services/published-results-store';
import { format } from 'date-fns';

export interface ExportResultsDialogResult {
  csv: string;
  filename: string;
}

/** Pick published seasons/series and download a long-format race-results CSV. */
@Component({
  selector: 'app-export-results-dialog',
  imports: [MatDialogModule, MatButtonModule, PublishedSeriesPicker],
  template: `
    <h2 mat-dialog-title>Export results (CSV)</h2>
    <mat-dialog-content>
      <app-published-series-picker [(selected)]="selected" showSelectAll />
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="dialogRef.close()" [disabled]="exporting()">Cancel</button>
      <button matButton="filled" type="button" (click)="export()" [disabled]="!canExport()">
        @if (exporting()) {
          Exporting…
        } @else {
          Export
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(480px, 90vw);
      max-height: 60vh;
    }
    .error {
      margin: 8px 0 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class ExportResultsDialog {
  protected readonly dialogRef = inject(MatDialogRef<ExportResultsDialog, ExportResultsDialogResult>);
  protected readonly reader = inject(PublishedResultsReader);

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly exporting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canExport = computed(() =>
    !this.exporting() && this.selected().size > 0 && !this.reader.seasonsLoading(),
  );

  protected async export(): Promise<void> {
    if (!this.canExport()) return;
    this.exporting.set(true);
    this.error.set(null);
    try {
      const selectedIds = this.selected();
      const seasonBySeriesId = new Map<string, { seasonName: string; info: SeriesInfo }>();
      for (const season of this.reader.seasons()) {
        for (const info of season.series) {
          if (selectedIds.has(info.id)) {
            seasonBySeriesId.set(info.id, { seasonName: season.name, info });
          }
        }
      }

      const chunks: PublishedSeriesExportChunk[] = [];
      for (const seriesId of selectedIds) {
        const meta = seasonBySeriesId.get(seriesId);
        const loaded = await this.reader.getSeriesWithRaces(seriesId);
        if (!loaded) {
          throw new Error(`Published series "${meta?.info.name ?? seriesId}" was not found.`);
        }
        chunks.push({
          seasonName: meta?.seasonName ?? '',
          series: loaded.series,
          races: loaded.races,
        });
      }

      const csv = buildPublishedResultsCsv(chunks);
      if (csv.split('\n').length <= 1) {
        this.error.set('No race results found for the selected series.');
        return;
      }

      this.dialogRef.close({
        csv,
        filename: `results-export-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      });
    } catch (e: unknown) {
      console.error('ExportResultsDialog: export failed', e);
      this.error.set(e instanceof Error ? e.message : 'Could not export results. Please try again.');
    } finally {
      this.exporting.set(false);
    }
  }
}
