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
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { ClubStore } from '../../club-tenant';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { Toolbar } from 'app/shared/components/toolbar';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { Series } from '../model/series';
import { RaceCalendarStore } from '../services/full-race-calander';
import { normaliseString } from 'app/shared/utils/string-utils';
import { getFleetName } from 'app/club-tenant/model/fleet';

@Component({
  selector: 'app-series-list',
  imports: [Toolbar, MatListModule, MatButtonModule, MatIconModule, RouterModule,
    MatDividerModule, MatTooltipModule, ReactiveFormsModule, MatFormFieldModule,
    MatInputModule, DatePipe, LoadingCentered, MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar title="Series"></app-toolbar>

    <div class="content">
      <div class="search-bar">
        <mat-form-field appearance="outline" class="search">
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

      <mat-divider />

      @if (rcs.isLoading()) {
        <app-loading-centered/>
      } @else {
        <mat-list class="content">
            @for (series of filteredSeries(); track series.id) {
            <mat-list-item>
              <span matListItemTitle>{{series.name}} ({{this.getSeasonName(series.seasonId)}})</span>
              <span matListItemLine>
                  {{getFleetName(series.primaryScoringConfiguration.fleet.id)}}
                  @if(series.startDate) { - {{series.startDate | date}} }
              </span>
              <span matListItemMeta>
                  <button matIconButton aria-label="Edit" [routerLink]="['/race-calender/series-details/'+series.id]">
                    <mat-icon>edit</mat-icon>
                  </button>
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
    </div>
  `,
  styles: `
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 500px);
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
      !term || normaliseString(s.name).includes(term) || normaliseString(s.seasonId).includes(term));
  });

  getFleetName = (id: string | undefined) => {
    if (!id) return 'Unknown Fleet';
    const fleet = this.cs.findFleet(id)();
    return fleet ? getFleetName(fleet) : 'Unknown Fleet';
  };

  getSeasonName = (id: string) => this.cs.club().seasons.find(s => s.id === id)?.name ?? 'Unknown Season';
}
