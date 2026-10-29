import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { RouterModule } from '@angular/router';
import { ClubStore } from '../../club-tenant';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { Toolbar } from 'app/shared/components/toolbar';
import { ListPane } from 'app/shared/layout/list-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { Series } from '../model/series';
import { RaceCalendarStore } from '../services/full-race-calander';
import { normaliseString } from 'app/shared/utils/string-utils';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { groupBy } from 'app/shared/utils/group-by';
import { seriesStatus, type SeriesStatus } from '../model/series-status';
import { StatusPill } from './status-pill/status-pill';

@Component({
  selector: 'app-series-list',
  imports: [Toolbar, MatListModule, MatButtonModule, MatIconModule, RouterModule,
    MatDividerModule, ReactiveFormsModule, MatFormFieldModule,
    MatInputModule, DatePipe, LoadingCentered, PageLayout, ListPane, StatusPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-layout>
      <app-toolbar title="Series"></app-toolbar>

      <app-list-pane maxWidth="500px">
        <div listHeader class="search-bar">
          <mat-form-field class="search">
              <mat-label>Search</mat-label>
              <input matInput [formControl]="searchControl" placeholder="Search">
              @if(searchControl.value) {
              <button mat-icon-button matSuffix (click)="searchControl.setValue('')" aria-label="Clear search">
                <mat-icon>close</mat-icon>
              </button>
              }
          </mat-form-field>

          <a matButton="tonal" class="right-justify" [routerLink]="['/race-calender/add']">
            New
          </a>
        </div>

        @if (rcs.isLoading()) {
          <app-loading-centered/>
        } @else {
          <mat-list class="dense-list">
              @for (series of filteredSeries(); track series.id) {
              <mat-list-item [routerLink]="['/race-calender/series-details', series.id]">
                <span matListItemTitle>{{series.name}} ({{this.getSeasonName(series.seasonId)}})</span>
                <span matListItemLine>
                    {{getFleetName(series.primaryScoringConfiguration.fleet.id)}}
                    @if(series.startDate) { - {{series.startDate | date}} }
                    <app-status-pill class="series-status" [status]="statusBySeries().get(series.id) ?? 'Future'" />
                </span>
              </mat-list-item>
              <mat-divider />
              } @empty {
              <mat-list-item>
                <span matListItemTitle>No Series found</span>
              </mat-list-item>
              }
          </mat-list>
        }
      </app-list-pane>
    </app-page-layout>
  `,
  styles: `
    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 12px 8px;
    }

    .search {
      flex: 1 1 auto;
      min-width: 0;
    }

    .right-justify {
      flex: 0 0 auto;
    }

    .series-status {
      margin-left: 8px;
    }
  `
})
export class SeriesList {
  protected rcs = inject(RaceCalendarStore);
  private cs = inject(ClubStore);

  searchControl = new FormControl('');
  searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(startWith(''), debounceTime(100), distinctUntilChanged()),
    { initialValue: '' }
  );

  filteredSeries = computed(() => {
    const term = normaliseString(this.searchTerm());
    return this.rcs.allSeries().filter((s: Series) =>
      !term
      || normaliseString(s.name).includes(term)
      || normaliseString(this.getSeasonName(s.seasonId)).includes(term));
  });

  readonly statusBySeries = computed(() => {
    const bySeries = groupBy(this.rcs.allRaces(), race => race.seriesId);
    return new Map<string, SeriesStatus>(
      [...bySeries.entries()].map(([seriesId, races]) => [seriesId, seriesStatus(races)]),
    );
  });

  getFleetName = (id: string | undefined) => {
    if (!id) return 'Unknown Fleet';
    const fleet = this.cs.findFleet(id)();
    return fleet ? getFleetName(fleet) : 'Unknown Fleet';
  };

  getSeasonName = (id: string) => this.cs.club().seasons.find(s => s.id === id)?.name ?? 'Unknown Season';
}
