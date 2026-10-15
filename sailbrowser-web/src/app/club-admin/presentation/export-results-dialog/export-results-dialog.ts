import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PublishedSeason, SeriesInfo } from 'app/published-results/model/published-season';
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
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>Export results (CSV)</h2>
    <mat-dialog-content>
      @if (reader.seasonsLoading()) {
        <div class="loading">
          <mat-spinner diameter="32" />
          <span>Loading seasons…</span>
        </div>
      } @else if (reader.seasonsError()) {
        <p class="error" role="alert">Could not load published seasons.</p>
      } @else if (seasons().length === 0) {
        <p>No published seasons found.</p>
      } @else {
        <div class="toolbar">
          <mat-checkbox
            [checked]="allSelected()"
            [indeterminate]="someSelected() && !allSelected()"
            (change)="selectAll($event.checked)">
            Select all series
          </mat-checkbox>
        </div>
        @for (season of seasons(); track season.id) {
          <section class="season">
            <div class="season-header">
              <mat-checkbox
                [checked]="seasonFullySelected(season)"
                [indeterminate]="seasonPartiallySelected(season)"
                (change)="selectSeason(season, $event.checked)">
                {{ season.name }}
              </mat-checkbox>
            </div>
            <ul class="series-list">
              @for (series of season.series; track series.id) {
                <li>
                  <mat-checkbox
                    [checked]="selected().has(series.id)"
                    (change)="toggle(series.id, $event.checked)">
                    {{ series.name }}
                    <span class="meta">{{ series.raceCount }} races</span>
                  </mat-checkbox>
                </li>
              }
            </ul>
          </section>
        }
      }
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
    .loading {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 0;
    }
    .toolbar {
      margin-bottom: 8px;
    }
    .season {
      margin-bottom: 12px;
    }
    .season-header {
      font-weight: 600;
    }
    .series-list {
      list-style: none;
      margin: 0;
      padding: 0 0 0 24px;
    }
    .meta {
      margin-left: 0.5rem;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
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

  protected readonly seasons = computed(() =>
    [...this.reader.seasons()].sort((a, b) => b.name.localeCompare(a.name)),
  );

  private readonly allSeriesIds = computed(() => this.seasons().flatMap(s => s.series.map(ser => ser.id)));

  protected readonly allSelected = computed(() => {
    const ids = this.allSeriesIds();
    return ids.length > 0 && ids.every(id => this.selected().has(id));
  });

  protected readonly someSelected = computed(() => this.selected().size > 0);

  protected readonly canExport = computed(() =>
    !this.exporting() && this.selected().size > 0 && !this.reader.seasonsLoading(),
  );

  protected toggle(seriesId: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(seriesId);
    else next.delete(seriesId);
    this.selected.set(next);
  }

  protected selectAll(checked: boolean): void {
    this.selected.set(new Set(checked ? this.allSeriesIds() : []));
  }

  protected selectSeason(season: PublishedSeason, checked: boolean): void {
    const next = new Set(this.selected());
    for (const series of season.series) {
      if (checked) next.add(series.id);
      else next.delete(series.id);
    }
    this.selected.set(next);
  }

  protected seasonFullySelected(season: PublishedSeason): boolean {
    return season.series.length > 0 && season.series.every(s => this.selected().has(s.id));
  }

  protected seasonPartiallySelected(season: PublishedSeason): boolean {
    const n = season.series.filter(s => this.selected().has(s.id)).length;
    return n > 0 && n < season.series.length;
  }

  protected async export(): Promise<void> {
    if (!this.canExport()) return;
    this.exporting.set(true);
    this.error.set(null);
    try {
      const selectedIds = this.selected();
      const seasonBySeriesId = new Map<string, { seasonName: string; info: SeriesInfo }>();
      for (const season of this.seasons()) {
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
