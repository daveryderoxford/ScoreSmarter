import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { ClubStore } from 'app/club-tenant';
import { ClassCatalogueStore } from 'app/club-tenant/services/class-catalogue-store';
import type { PublishedRace } from 'app/published-results/model/published-race';
import type { PublishedSeason } from 'app/published-results/model/published-season';
import { PublishedResultsReader } from 'app/published-results/services/published-results-store';
import { buildPyReturn, pyReturnToCsv, type PyReturnBuild } from 'app/published-results/services/py-returns';
import { format } from 'date-fns';

export interface PyReturnsDialogResult {
  csv: string;
  filename: string;
}

/** Pick published series, check them against the RYA PY criteria and download the return. */
@Component({
  selector: 'app-py-returns-dialog',
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './py-returns-dialog.html',
  styleUrl: './py-returns-dialog.scss',
})
export class PyReturnsDialog {
  protected readonly dialogRef = inject(MatDialogRef<PyReturnsDialog, PyReturnsDialogResult>);
  protected readonly reader = inject(PublishedResultsReader);
  private readonly clubStore = inject(ClubStore);
  private readonly catalogue = inject(ClassCatalogueStore);

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly build = signal<PyReturnBuild | null>(null);

  protected readonly seasons = computed(() =>
    [...this.reader.seasons()].sort((a, b) => b.name.localeCompare(a.name)),
  );

  protected readonly entryCount = computed(() =>
    (this.build()?.ret.races ?? []).reduce((sum, r) => sum + r.entries.length, 0),
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
    const boatClass = this.clubStore.club().classes.find(c => c.name === className);
    return boatClass ? ['/club', 'classes', 'edit', boatClass.id] : null;
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

  protected downloadCsv(): void {
    const build = this.build();
    if (!build || build.ret.races.length === 0) return;
    this.dialogRef.close({
      csv: pyReturnToCsv(build.ret),
      filename: `rya-py-return-${format(new Date(), 'yyyy-MM-dd')}.csv`,
    });
  }
}
