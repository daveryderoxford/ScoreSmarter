import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PublishedSeason } from 'app/published-results';
import { distinctDisplayGroups } from 'app/race-calender/model/series-display-group';
import { startOfDay, subDays } from 'date-fns';

type SeriesInfo = PublishedSeason['series'][number];

/**
 * Displays published series grouped by season, with a filter by series display group
 * (shown when any series has one) and a 6-day recent-races badge.
 */
@Component({
  selector: 'app-season-list',
  imports: [
    MatExpansionModule,
    MatBadgeModule,
    MatIconButton,
    MatIconModule,
    MatListModule,
    RouterLink,
    RouterLinkActive,
    MatFormFieldModule,
    MatSelectModule,
  ],
  templateUrl: './season-list.html',
  styles: `
   /* Fill the list column, growing past it (and scrolling) when the list is longer. */
   :host {
      display: flex;
      flex-direction: column;
      flex: 1 0 auto;
   }

   .container {
      flex: 1 0 auto;
      box-sizing: border-box;
      background: var(--mat-sys-surface-variant);
      padding: 15px;
   }
   .filter-container {
    display: flex;
    width: 100%;
    align-items: flex-start;
    gap: 8px;
   }

   .filter {
    flex: 1 1 auto;
    min-width: 0;
   }

   .align-right {
    margin-left: auto;
   }

   .season-list-panel-body {
     box-sizing: border-box;
     padding-inline: 25px;
     padding-bottom: 20px;
   }

   .season-list-panel-body mat-nav-list {
     padding-block: 0;
   }

   mat-list-item.season-list-item--active {
     background-color: color-mix(in srgb, var(--mat-sys-primary) 18%, transparent);
     border-radius: var(--mat-sys-corner-medium, 8px);
   }

   mat-list-item.season-list-item--active .mdc-list-item__primary-text {
     font-weight: 500;
   }

  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeasonList {
  /** Input for the seasons and their series to be displayed. */
  seasons = input.required<PublishedSeason[]>();
  hide = output();
  /** Shown in the wide split view so the list pane can be collapsed. */
  showCollapseButton = input(false);

  /** Display group to show. Empty means all series. */
  protected displayGroupFilter = signal('');

  /** All primary series across seasons */
  private allSeries = computed(() =>
    this.seasons().flatMap(s => s.series).filter(s => !s.baseSeriesId || s.id === s.baseSeriesId),
  );

  /** Display groups of the published series, for the filter. */
  protected displayGroups = computed(() => distinctDisplayGroups(this.allSeries()));

  /** The selected group, or empty when it's no longer one of the groups. */
  private selectedDisplayGroup = computed(() => {
    const selected = this.displayGroupFilter();
    return this.displayGroups().includes(selected) ? selected : '';
  });

  /**
   * Ordering key: prefer the scheduled start of the latest published race in
   * the series; fall back to the calendar-derived endDate for legacy docs.
   */
  private seriesOrderDate(s: SeriesInfo): Date {
    return s.lastPublishedRaceStart ?? s.endDate;
  }

  protected filteredSeasons = computed(() => {
    const group = this.selectedDisplayGroup();

    return this.seasons().map(season => ({
      ...season,
      series: season.series
        .filter(s => !s.baseSeriesId || s.id === s.baseSeriesId)
        .filter(primarySeries => !group || primarySeries.displayGroup === group)
        .sort((a, b) => this.seriesOrderDate(b).getTime() - this.seriesOrderDate(a).getTime()),
    }));
  });

  protected expansionPanels = computed(() => {
    return this.filteredSeasons()
      .filter(s => s.series.length > 0)
      .map(s => ({ id: s.id, title: s.name || s.id, series: s.series }))
      .sort((a, b) => {
        const aLatest = a.series.reduce(
          (max, s) => {
            const d = this.seriesOrderDate(s);
            return d > max ? d : max;
          },
          this.seriesOrderDate(a.series[0]),
        );
        const bLatest = b.series.reduce(
          (max, s) => {
            const d = this.seriesOrderDate(s);
            return d > max ? d : max;
          },
          this.seriesOrderDate(b.series[0]),
        );
        return bLatest.getTime() - aLatest.getTime();
      });
  });

  protected expandedSeasonId = computed(() => {
    const panels = this.expansionPanels();
    if (panels.length === 0) return '';

    return panels.reduce((current, candidate) => {
      const currentLastRace = current.series.reduce(
        (max, s) => {
          const d = this.seriesOrderDate(s);
          return d > max ? d : max;
        },
        this.seriesOrderDate(current.series[0]),
      );
      const candidateLastRace = candidate.series.reduce(
        (max, s) => {
          const d = this.seriesOrderDate(s);
          return d > max ? d : max;
        },
        this.seriesOrderDate(candidate.series[0]),
      );
      return candidateLastRace > currentLastRace ? candidate : current;
    }).id;
  });

  protected recentRaceBadgeCount(series: SeriesInfo): number {
    const cutoffDay = startOfDay(subDays(new Date(), 6)).getTime();
    const seriesLastRaceDay = startOfDay(series.endDate).getTime();
    if (seriesLastRaceDay < cutoffDay) {
      return 0;
    }

    return typeof series.recentRaceCount6d === 'number'
      ? Math.max(0, series.recentRaceCount6d)
      : 0;
  }

  protected trackBySeasonName(index: number, season: PublishedSeason): string {
    return season.id;
  }
}
