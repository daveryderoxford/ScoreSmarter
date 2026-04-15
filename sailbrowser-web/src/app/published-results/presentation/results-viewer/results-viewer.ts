import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import { afterRenderEffect, Component, computed, effect, ElementRef, inject, input, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { RouterLink, Router } from '@angular/router';
import { PublishedResultsReader } from 'app/published-results/services/published-results-store';
import { getConfigName } from 'app/scoring/model/scoring-configuration';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from "app/shared/components/toolbar";
import { RaceResultsTable } from "../results-tables/race-results-table/race-results-table";
import { SeriesResultsTable } from "../results-tables/series-results-table/series-results-table";
import { SeasonList } from "../season-list/season-list";
import { CenteredText } from 'app/shared/components/centered-text';
import { ClubStore, Fleet } from 'app/club-tenant';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { AuthService } from 'app/auth/auth.service';
import { CurrentRaces } from 'app/results-input';

@Component({
  selector: 'app-results-viewer',
  imports: [Toolbar, SeasonList, SeriesResultsTable, LoadingCentered, RaceResultsTable, MatIconModule, MatButtonModule, DatePipe, CenteredText, RouterLink, MatSelectModule, MatFormFieldModule, MatChipsModule],
  templateUrl: './results-viewer.html',
  styleUrl: './results-viewer.scss',
})
export class ResultsViewer {

  protected store = inject(PublishedResultsReader);
  protected cs = inject(ClubStore);
  protected isPanelCollapsed = signal(false);
  private elementRef = inject(ElementRef);
  protected breakpoints = inject(AppBreakpoints);
  protected auth = inject(AuthService);
  private router = inject(Router);
  private currentRacesStore = inject(CurrentRaces);
  private readonly autoScrolledTarget = signal('');

  id = input<string>('');  // Route parameter
  raceId = input<string>(''); // Query parameter

  isMobile = this.breakpoints.isMobile;

  series = this.store.series;
  races = this.store.races;
  seasons = this.store.seasons;
  reversedRaces = computed(() => [...this.races()].reverse());

  currentFleetName = computed(() => {
    const s = this.series();
    if (!s) return '';
    const fleet = this.cs.club().fleets.find(f => f.id === s.fleetId);
    return fleet ? getFleetName(fleet) : s.fleetId;
  });

  currentSeriesInfo = computed(() => {
    const id = this.id();
    for (const season of this.seasons()) {
      const seriesInfo = season.series.find(s => s.id === id);
      if (seriesInfo) return seriesInfo;
    }
    return undefined;
  });

  alternativeConfigurations = computed(() => {
    const current = this.currentSeriesInfo();
    if (!current || !current.baseSeriesId) return [];

    // Find the season that contains this series
    const season = this.seasons().find(s => s.series.some(ser => ser.id === current.id));
    if (!season) return [];

    // Filter series in THIS season that share the same baseSeriesId
    // We also check the ID format to be extra sure (primary is baseSeriesId, secondary is baseSeriesId_configId)
    return season.series.filter(s =>
      s.baseSeriesId === current.baseSeriesId &&
      (s.id === current.baseSeriesId || s.id.startsWith(current.baseSeriesId + '_'))
    );
  });

  readonly selectedSeriesName = computed(() => this.series()?.name?.trim() ?? '');

  readonly selectedScoringAlgorithmLabel = computed(() => {
    const publishedSeries = this.series();
    if (!publishedSeries) return '';

    const scheme = publishedSeries.competitors[0]?.handicapScheme;
    const fleet = this.cs.club().fleets.find(f => f.id === publishedSeries.fleetId);

    if (scheme) {
      return getConfigName(scheme, fleet) ?? scheme;
    }
    return (this.currentSeriesInfo()?.name || this.currentFleetName()).trim();
  });

  raceTitles = computed(() => this.races().map((({ id, index, scheduledStart, raceOfDay }) => ({
    id,
    index,
    scheduledStart,
    raceOfDay
  })
  )));

  constructor() {
    // Effect to read series data when the selected Id changes
    // based on route parameter
    effect(() => {
      this.store.selectedSeriesId.set(this.id());
    });

    // When deep-linked with raceId, scroll the selected race into view after render.
    afterRenderEffect(() => {
      const seriesId = this.id();
      const targetRaceId = this.raceId();
      const races = this.reversedRaces();
      if (!seriesId || !targetRaceId || races.length === 0) return;
      if (!races.some(r => r.id === targetRaceId)) return;

      const targetKey = `${seriesId}:${targetRaceId}`;
      if (this.autoScrolledTarget() === targetKey) return;

      if (this.scrollToRaceElement(targetRaceId)) {
        this.autoScrolledTarget.set(targetKey);
      }
    });
  }

  togglePanel() {
    this.isPanelCollapsed.update(v => !v);
  }

  raceClicked(raceId: string) {
    this.scrollToRaceElement(raceId);
  }

  scrollToTop() {
    this.elementRef.nativeElement.querySelector('.content-area')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  editRace(raceId: string) {
    this.currentRacesStore.addRaceId(raceId);
    this.router.navigate(['/results-input/manual'], { queryParams: { raceId } });
  }

  onConfigurationChange(newSeriesId: string) {
    this.router.navigate(['/results/viewer', newSeriesId]);
  }

  private scrollToRaceElement(raceId: string): boolean {
    const element = this.elementRef.nativeElement.querySelector(`[data-race-id="${raceId}"]`);
    if (!element) return false;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

}
