import { Clipboard } from '@angular/cdk/clipboard';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ClubStore } from 'app/club-tenant';
import { ClassCatalogueStore } from 'app/club-tenant/services/class-catalogue-store';
import type { PublishedRace } from 'app/published-results/model/published-race';
import type { PublishedSeason } from 'app/published-results/model/published-season';
import { PublishedResultsReader } from 'app/published-results/services/published-results-store';
import {
  buildPyReturn,
  findClubClass,
  pyReturnFilename,
  pyReturnToCsv,
  type PyReturnBuild,
  type PySeriesReturn,
} from 'app/published-results/services/py-returns';

/**
 * Pick published series, check them against the RYA PY criteria and download one
 * PY Online file per series (PY Online gives each uploaded file one event name).
 */
@Component({
  selector: 'app-py-returns-dialog',
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './py-returns-dialog.html',
  styleUrl: './py-returns-dialog.scss',
})
export class PyReturnsDialog {
  protected readonly dialogRef = inject(MatDialogRef<PyReturnsDialog>);
  protected readonly reader = inject(PublishedResultsReader);
  private readonly clubStore = inject(ClubStore);
  private readonly catalogue = inject(ClassCatalogueStore);
  private readonly clipboard = inject(Clipboard);
  private readonly snackbar = inject(MatSnackBar);

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly build = signal<PyReturnBuild | null>(null);
  /** Series files downloaded in this session, to tick them off. */
  protected readonly downloaded = signal<ReadonlySet<string>>(new Set());

  protected readonly seasons = computed(() =>
    [...this.reader.seasons()].sort((a, b) => b.name.localeCompare(a.name)),
  );

  protected readonly canCheck = computed(() => !this.loading() && this.selected().size > 0);

  protected toggle(seriesId: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(seriesId);
    else next.delete(seriesId);
    this.selected.set(next);
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

  protected classEditLink(className: string): string[] | null {
    const boatClass = findClubClass(className, this.clubStore.club().classes);
    return boatClass ? ['/club', 'classes', 'edit', boatClass.id] : null;
  }

  protected entryCount(series: PySeriesReturn): number {
    return series.races.reduce((sum, r) => sum + r.entries.length, 0);
  }

  protected async check(): Promise<void> {
    if (!this.canCheck()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const races: PublishedRace[] = [];
      for (const seriesId of this.selected()) {
        const loaded = await this.reader.getSeriesWithRaces(seriesId);
        if (loaded) races.push(...loaded.races);
      }
      const club = this.clubStore.club();
      this.build.set(buildPyReturn(races, club.classes, this.catalogue.byId(), club.ryaAffiliationId));
      this.downloaded.set(new Set());
    } catch (e: unknown) {
      console.error('PyReturnsDialog: check failed', e);
      this.error.set(e instanceof Error ? e.message : 'Could not load the selected results.');
    } finally {
      this.loading.set(false);
    }
  }

  protected backToSelection(): void {
    this.build.set(null);
  }

  protected copyEventName(series: PySeriesReturn): void {
    if (this.clipboard.copy(series.eventName)) {
      this.snackbar.open('Event name copied', undefined, { duration: 2000 });
    }
  }

  protected download(series: PySeriesReturn): void {
    const blob = new Blob([pyReturnToCsv(series)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pyReturnFilename(series);
    a.click();
    URL.revokeObjectURL(url);
    this.downloaded.set(new Set([...this.downloaded(), series.seriesId]));
  }
}
