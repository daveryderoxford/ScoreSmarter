import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import {
  EntriesCsvService,
  type EntriesCsvSeriesMapping,
} from '../services/entries-csv.service';
import { EntryService } from '../services/entry.service';

@Component({
  selector: 'app-import-entries-dialog',
  imports: [
    MatDialogModule,
    MatDividerModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Import entries</h2>
    <div mat-dialog-content class="dialog-content">
      <p class="intro">
        Import visitor entries from a CSV. Each row creates a series entry and signs them on
        to every race in the mapped series. The boat register is not updated.
      </p>

      <div class="file-row">
        <input
          #fileInput
          type="file"
          accept=".csv,text/csv"
          class="file-input"
          (change)="onFileSelected($event)" />
        <button matButton="tonal" type="button" (click)="fileInput.click()">Choose CSV</button>
        <span class="file-name">{{ fileName() || 'No file selected' }}</span>
      </div>

      <h3 class="section-title">Series to include</h3>
      @for (mapping of mappings(); track $index; let i = $index) {
        <div class="mapping-row">
          <mat-form-field>
            <mat-label>Series</mat-label>
            <mat-select
              [value]="mapping.seriesId"
              (selectionChange)="updateMapping(i, 'seriesId', $event.value)">
              @for (series of availableSeries(); track series.id) {
                <mat-option [value]="series.id">{{ seriesLabel(series.id) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Name in CSV (optional)</mat-label>
            <input
              matInput
              [value]="mapping.csvSeriesName"
              [placeholder]="csvNamePlaceholder(mapping.seriesId)"
              (input)="updateMapping(i, 'csvSeriesName', inputValue($event))" />
          </mat-form-field>
          <button
            matIconButton
            type="button"
            aria-label="Remove series mapping"
            [disabled]="mappings().length === 1"
            (click)="removeMapping(i)">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
      <button matButton type="button" (click)="addMapping()">Add series</button>

      @if (plan(); as preview) {
        @if (preview.errors.length > 0) {
          <div class="errors" role="alert">
            <p>The file cannot be imported until these errors are fixed:</p>
            <ul>
              @for (error of preview.errors; track error) {
                <li>{{ error }}</li>
              }
            </ul>
          </div>
        } @else if (fileName()) {
          <div class="summary">
            @if (preview.series.length === 0) {
              <p>No mapped entries to import.</p>
            } @else {
              @for (group of preview.series; track group.seriesId) {
                <section>
                  <h4>{{ group.seriesName }} — {{ group.entries.length }}
                    {{ group.entries.length === 1 ? 'entry' : 'entries' }},
                    {{ group.races.length }}
                    {{ group.races.length === 1 ? 'race' : 'races' }}</h4>
                  <ul>
                    @for (entry of group.entries; track entry.lineNumber) {
                      <li>{{ entry.helm }} · {{ entry.boatClass }} · {{ entry.sailNumber }}</li>
                    }
                  </ul>
                </section>
              }
            }
            @if (preview.ignoredRowCount > 0) {
              <p class="ignored">
                Ignored {{ preview.ignoredRowCount }}
                {{ preview.ignoredRowCount === 1 ? 'row' : 'rows' }}
                for unmapped series
                ({{ preview.ignoredSeriesNames.join(', ') }}).
              </p>
            }
          </div>
        }
      }

      @if (importError(); as message) {
        <p class="import-error" role="alert">{{ message }}</p>
      }
    </div>
    <mat-divider />
    <div mat-dialog-actions align="end">
      <button type="button" matButton="text" (click)="dialogRef.close()">Cancel</button>
      <button
        type="button"
        matButton="filled"
        [disabled]="!canImport() || importing()"
        (click)="importEntries()">
        {{ importing() ? 'Importing…' : 'Import' }}
      </button>
    </div>
  `,
  styles: `
    .dialog-content {
      min-width: min(36rem, 90vw);
      max-width: 44rem;
    }
    .intro {
      margin: 0 0 1rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .file-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 1rem;
    }
    .file-input {
      display: none;
    }
    .file-name {
      color: var(--mat-sys-on-surface-variant);
    }
    .section-title {
      font: var(--mat-sys-title-small);
      margin: 0.5rem 0;
    }
    .mapping-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 8px;
      align-items: start;
    }
    .errors, .import-error {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .summary {
      margin-top: 1rem;
    }
    .summary h4 {
      margin: 0.75rem 0 0.25rem;
    }
    .summary ul {
      margin: 0;
      padding-left: 1.25rem;
    }
    .ignored {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ImportEntriesDialog {
  protected readonly dialogRef = inject(MatDialogRef<ImportEntriesDialog, boolean>);
  private readonly csv = inject(EntriesCsvService);
  private readonly entryService = inject(EntryService);
  private readonly calendar = inject(RaceCalendarStore);
  private readonly club = inject(ClubStore);
  private readonly seriesEntries = inject(SeriesEntryStore);

  readonly fileName = signal('');
  readonly csvText = signal('');
  readonly mappings = signal<EntriesCsvSeriesMapping[]>([{ seriesId: '', csvSeriesName: '' }]);
  readonly existingBySeries = signal<ReadonlyMap<string, readonly SeriesEntry[]>>(new Map());
  readonly importing = signal(false);
  readonly importError = signal<string | null>(null);

  readonly availableSeries = computed(() =>
    this.calendar.allSeries().filter(s => !s.archived),
  );

  readonly plan = computed(() => {
    const text = this.csvText();
    if (!text) return null;
    return this.csv.buildPlan(
      text,
      this.mappings().filter(m => m.seriesId),
      {
        series: this.calendar.allSeries(),
        races: this.calendar.allRaces(),
        classes: this.club.club().classes,
        tagDefinitions: this.club.club().tagDefinitions ?? [],
        existingEntriesBySeriesId: this.existingBySeries(),
      },
    );
  });

  readonly canImport = computed(() => {
    const plan = this.plan();
    return !!plan && plan.errors.length === 0 && plan.series.some(s => s.entries.length > 0);
  });

  constructor() {
    effect((onCleanup) => {
      const ids = [...new Set(this.mappings().map(m => m.seriesId).filter(Boolean))];
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      void (async () => {
        const next = new Map<string, SeriesEntry[]>();
        for (const id of ids) {
          next.set(id, await this.seriesEntries.getSeriesEntries(id));
        }
        if (!cancelled) this.existingBySeries.set(next);
      })();
    });
  }

  seriesLabel(seriesId: string): string {
    const series = this.availableSeries().find(s => s.id === seriesId);
    if (!series) return seriesId;
    const sameName = this.availableSeries().filter(s => s.name === series.name).length > 1;
    if (!sameName) return series.name;
    const season = this.club.club().seasons.find(s => s.id === series.seasonId)?.name;
    return season ? `${series.name} (${season})` : series.name;
  }

  csvNamePlaceholder(seriesId: string): string {
    return this.availableSeries().find(s => s.id === seriesId)?.name ?? 'CSV series name';
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  updateMapping(index: number, field: keyof EntriesCsvSeriesMapping, value: string): void {
    this.mappings.update(rows =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  addMapping(): void {
    this.mappings.update(rows => [...rows, { seriesId: '', csvSeriesName: '' }]);
  }

  removeMapping(index: number): void {
    this.mappings.update(rows => rows.filter((_, i) => i !== index));
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.fileName.set(file.name);
    this.csvText.set(await file.text());
    this.importError.set(null);
  }

  async importEntries(): Promise<void> {
    const plan = this.plan();
    if (!plan || !this.canImport()) return;
    this.importing.set(true);
    this.importError.set(null);
    try {
      await this.entryService.importEntries(plan);
      this.dialogRef.close(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed.';
      this.importError.set(message);
    } finally {
      this.importing.set(false);
    }
  }
}
