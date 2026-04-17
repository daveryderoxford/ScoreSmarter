import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PublishedSeason } from 'app/published-results';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { normaliseString } from 'app/shared/utils/string-utils';
import { subDays } from 'date-fns';

type SeriesInfo = PublishedSeason['series'][number];

/**
 * Displays published series grouped by season, with optional text filter on series name or fleet id.
 */
@Component({
  selector: 'app-season-list',
  imports: [
    FormsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconButton,
    MatIconModule,
    MatInputModule,
    MatListModule,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './season-list.html',
  styles: `
   .container {
      height: 100%;
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
  protected breakpoints = inject(AppBreakpoints);

  /** Input for the seasons and their series to be displayed. */
  seasons = input.required<PublishedSeason[]>();
  hide = output();

  /** Text filter: matches series name or published fleet id (primary or alternate views). */
  protected subseriesFilter = signal('');

  /** All primary series across seasons */
  private allSeries = computed(() =>
    this.seasons().flatMap(s => s.series).filter(s => !s.baseSeriesId || s.id === s.baseSeriesId),
  );

  /** Series with a race in the last week */
  latestSeries = computed(() => {
    const series = this.allSeries();
    if (series.length === 0) return [];

    const lastRaceDate = series.reduce((max, s) => (s.endDate > max ? s.endDate : max), series[0].endDate);

    const cutoff = subDays(lastRaceDate, 7).getTime();
    const end = lastRaceDate.getTime();

    return series.filter(s => {
      const time = s.endDate.getTime();
      return time >= cutoff && time <= end;
    });
  });

  protected filteredSeasons = computed(() => {
    const filter = normaliseString(this.subseriesFilter());

    return this.seasons().map(season => ({
      ...season,
      series: season.series
        .filter(s => !s.baseSeriesId || s.id === s.baseSeriesId)
        .filter(primarySeries => {
          if (!filter) return true;
          const alternatives = season.series.filter(
            s => s.baseSeriesId === primarySeries.id || s.id === primarySeries.id,
          );
          return alternatives.some(
            s => normaliseString(s.name).includes(filter) || normaliseString(s.fleetId).includes(filter),
          );
        })
        .map(primarySeries => {
          if (!filter) return primarySeries;
          const alternatives = season.series.filter(
            s => s.baseSeriesId === primarySeries.id || s.id === primarySeries.id,
          );
          const bestMatch = alternatives.find(
            s =>
              normaliseString(s.name).includes(filter) || normaliseString(s.fleetId).includes(filter),
          );
          return bestMatch || primarySeries;
        }),
    }));
  });

  protected expansionPanels = computed(() => {
    const panels: { title: string; series: SeriesInfo[] }[] = [];
    const latest = this.latestSeries();
    if (latest.length > 0) {
      panels.push({ title: 'Latest results', series: latest });
    }
    panels.push(
      ...this.filteredSeasons()
        .filter(s => s.series.length > 0)
        .map(s => ({ title: s.name || s.id, series: s.series })),
    );
    return panels;
  });

  protected trackBySeasonName(index: number, season: PublishedSeason): string {
    return season.id;
  }
}
