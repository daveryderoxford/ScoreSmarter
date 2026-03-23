import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { PublishedSeason } from 'app/published-results';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { normaliseString } from 'app/shared/utils/string-utils';
import { endOfDay, subDays } from 'date-fns';

/**
 * A dumb component to display a list of published race series, grouped by season.
 * It allows filtering by fleet and emits an event when a series is selected.
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
   }

   .filter {
    width: 200px;
   }

   .align-right {
    margin-left: auto;
   }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeasonList {
  protected breakpoints = inject(AppBreakpoints);

  /** Input for the seasons and their series to be displayed. */
  seasons = input.required<PublishedSeason[]>();
  hide = output();

  /** Signal to hold the current filter text for subseries. */
  protected subseriesFilter = signal('');

  /** All series */
  private allSeries = computed(() =>
    this.seasons().flatMap(s => s.series).filter(s => !s.baseSeriesId || s.id === s.baseSeriesId)
  );

  /** Series with a race in the last week */
  latestSeries = computed(() => {
    const series = this.allSeries();
    if (series.length === 0) return [];

    const lastRaceDate = series.reduce((max, s) =>
      s.endDate > max ? s.endDate : max,
      series[0].endDate
    );

    const cutoff = subDays(lastRaceDate, 7).getTime();
    const end = lastRaceDate.getTime();

    // 2. Filter for everything in that 7-day window
    return series.filter(s => {
      const time = s.endDate.getTime();
      return time >= cutoff && time <= end;
    });
  });

  /**
   * A computed signal that filters the seasons based on the subseriesFilter.
   * A season is included if any of its series contain a name or fleet matching the filter.
   */
  protected filteredSeasons = computed(() => {
    const filter = normaliseString(this.subseriesFilter());
    
    return this.seasons().map((season) => ({
      ...season,
      series: season.series
        .filter(s => !s.baseSeriesId || s.id === s.baseSeriesId) // Show primary series in the list
        .filter((primarySeries) => {
          if (!filter) return true;
          // Check if primary OR any of its alternatives match the filter
          const alternatives = season.series.filter(s => s.baseSeriesId === primarySeries.id || s.id === primarySeries.id);
          return alternatives.some(s => 
            normaliseString(s.name).includes(filter) || 
            normaliseString(s.fleetId).includes(filter)
          );
        })
        .map(primarySeries => {
           if (!filter) return primarySeries;
           // Find the best matching configuration to link to
           const alternatives = season.series.filter(s => s.baseSeriesId === primarySeries.id || s.id === primarySeries.id);
           const bestMatch = alternatives.find(s => 
             normaliseString(s.name).includes(filter) || 
             normaliseString(s.fleetId).includes(filter)
           );
           return bestMatch || primarySeries;
        })
    }));
  });

  // Expansion data. 
  protected expansionPanels = computed(() => {
    const panels = [];
    const latest = this.latestSeries();
    if (latest.length > 0) {
      panels.push({ title: 'Latest results', series: latest });
    }
    panels.push(...this.filteredSeasons()
      .filter(s => s.series.length > 0)
      .map(s => ({ title: s.id, series: s.series })));
    return panels;
  });

  /**
   * TrackBy function for the season list to improve performance.
   */
  protected trackBySeasonName(index: number, season: PublishedSeason): string {
    return season.id;
  }
}
