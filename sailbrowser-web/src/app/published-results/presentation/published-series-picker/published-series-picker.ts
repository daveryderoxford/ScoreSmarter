import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, model, resource } from '@angular/core';
import { getDoc } from '@angular/fire/firestore';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FirestoreTenantService } from 'app/club-tenant';
import type { Series } from 'app/race-calender/model/series';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import type { PublishedSeason, SeriesInfo } from '../../model/published-season';
import {
  calendarHandicapScheme,
  calendarSeriesId,
  filterPublishedSeries,
  isSecondarySeries,
} from '../../model/published-series-filter';
import { PublishedResultsReader } from '../../services/published-results-store';

/** Seasons (newest first) with checkboxes for picking published series. */
@Component({
  selector: 'app-published-series-picker',
  imports: [MatCheckboxModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="loading">
        <mat-spinner diameter="32" />
        <span>Loading seasons…</span>
      </div>
    } @else if (reader.seasonsError()) {
      <p class="error" role="alert">Could not load published seasons.</p>
    } @else if (seasons().length === 0) {
      <p>No published seasons found.</p>
    } @else {
      @if (showSelectAll()) {
        <div class="toolbar">
          <mat-checkbox
            [checked]="allSelected()"
            [indeterminate]="selected().size > 0 && !allSelected()"
            (change)="selectAll($event.checked)">
            Select all series
          </mat-checkbox>
        </div>
      }
      @for (season of seasons(); track season.id) {
        <section class="season">
          <mat-checkbox
            class="season-header"
            [checked]="seasonFullySelected(season)"
            [indeterminate]="seasonPartiallySelected(season)"
            (change)="selectSeason(season, $event.checked)">
            {{ season.name }}
          </mat-checkbox>
          <ul class="series-list">
            @for (series of season.series; track series.id) {
              <li>
                <mat-checkbox [checked]="selected().has(series.id)" (change)="toggle(series.id, $event.checked)">
                  {{ series.name }}
                  <span class="meta">{{ series.raceCount }} races</span>
                </mat-checkbox>
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: `
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
      color: var(--mat-sys-error);
    }
  `,
})
export class PublishedSeriesPicker {
  protected readonly reader = inject(PublishedResultsReader);
  private readonly tenant = inject(FirestoreTenantService);

  /** Selected published series ids. */
  readonly selected = model<ReadonlySet<string>>(new Set());
  readonly excludeSecondary = input(false, { transform: booleanAttribute });
  readonly excludeLevelRating = input(false, { transform: booleanAttribute });
  readonly showSelectAll = input(false, { transform: booleanAttribute });

  /** Series published before `SeriesInfo.handicapScheme` was recorded, looked up from their calendar series. */
  private readonly calendarSchemes = resource({
    params: () => {
      if (!this.excludeLevelRating()) return undefined;
      return this.reader
        .seasons()
        .flatMap(s => s.series)
        .filter(info => !info.handicapScheme && !(this.excludeSecondary() && isSecondarySeries(info)));
    },
    loader: async ({ params }) => {
      const schemes = new Map<string, HandicapScheme>();
      const byCalendarId = new Map<string, SeriesInfo[]>();
      for (const info of params) {
        const id = calendarSeriesId(info);
        byCalendarId.set(id, [...(byCalendarId.get(id) ?? []), info]);
      }
      await Promise.all(
        [...byCalendarId].map(async ([id, infos]) => {
          const snap = await getDoc(this.tenant.docRef<Series>('series', id));
          if (!snap.exists()) return;
          for (const info of infos) {
            const scheme = calendarHandicapScheme(info, snap.data());
            if (scheme) schemes.set(info.id, scheme);
          }
        }),
      );
      return schemes;
    },
  });

  protected readonly loading = computed(() => this.reader.seasonsLoading() || this.calendarSchemes.isLoading());

  /** Seasons newest first, each with the series that pass the filter; empty seasons are left out. */
  protected readonly seasons = computed<PublishedSeason[]>(() => {
    const filter = { excludeSecondary: this.excludeSecondary(), excludeLevelRating: this.excludeLevelRating() };
    const schemes = this.calendarSchemes.hasValue() ? this.calendarSchemes.value() : new Map();
    return [...this.reader.seasons()]
      .sort((a, b) => b.name.localeCompare(a.name))
      .map(season => ({ ...season, series: filterPublishedSeries(season.series, filter, schemes) }))
      .filter(season => season.series.length > 0);
  });

  private readonly allSeriesIds = computed(() => this.seasons().flatMap(s => s.series.map(series => series.id)));

  protected readonly allSelected = computed(() => {
    const ids = this.allSeriesIds();
    return ids.length > 0 && ids.every(id => this.selected().has(id));
  });

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
    return season.series.every(s => this.selected().has(s.id));
  }

  protected seasonPartiallySelected(season: PublishedSeason): boolean {
    const n = season.series.filter(s => this.selected().has(s.id)).length;
    return n > 0 && n < season.series.length;
  }
}
