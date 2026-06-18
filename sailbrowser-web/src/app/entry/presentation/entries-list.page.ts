import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  inputBinding,
  outputBinding,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Race } from 'app/race-calender';
import { ResolvedRaceCompetitor } from 'app/results-input';
import { CenteredText } from 'app/shared/components/centered-text';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { formatRaceTitle } from 'app/shared/pipes/race-title-pipe';
import { CurrentRaces } from '../../results-input/services/current-races-store';
import { RaceCompetitorMutator } from '../../results-input/services/race-competitor-mutator';
import { RaceCompetitorReader } from '../../results-input/services/race-competitor-reader';
import { DeleteEntryDialog, DeleteEntryRaceRow } from './delete-entry-dialog';
import { MatCard } from "@angular/material/card";

/** View filter only — does not change which competitors are loaded from Firestore. */
type EntriesViewScope = 'today' | 'current';

interface BoatSeriesSummary {
  seriesName: string;
  raceCount: number;
}

interface BoatEntrySummary {
  boatId: string;
  boatClass: string;
  sailNumber: string;
  helm: string;
  seriesSummaries: BoatSeriesSummary[];
  competitors: ResolvedRaceCompetitor[];
}

interface RaceEntryCountRow {
  race: Race;
  count: number;
}

@Component({
  selector: 'app-entries-list-page',
  imports: [
    Toolbar,
    LoadingCentered,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    CenteredText,
    MatCard
],
  templateUrl: './entries-list.page.html',
  styleUrl: './entries-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntriesListPage {
  protected readonly reader = inject(RaceCompetitorReader);
  private readonly mutator = inject(RaceCompetitorMutator);
  private readonly currentRaces = inject(CurrentRaces);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);

  /** Default: today's races only. */
  readonly viewScope = signal<EntriesViewScope>('today');

  readonly scopeLabel = computed(() =>
    this.viewScope() === 'current' ? 'Recent' : "Today",
  );

  private readonly visibleRaces = computed(() =>
    this.viewScope() === 'today'
      ? this.currentRaces.todaysRaces()
      : this.currentRaces.selectedRaces(),
  );

  private readonly visibleRaceIds = computed(
    () => new Set(this.visibleRaces().map(race => race.id)),
  );

  readonly filteredCompetitors = computed(() =>
    this.reader.selectedResolvedCompetitors().filter(c => this.visibleRaceIds().has(c.raceId)),
  );

  readonly raceEntryRows = computed((): RaceEntryCountRow[] => {
    const countsByRace = new Map<string, number>();
    for (const comp of this.filteredCompetitors()) {
      countsByRace.set(comp.raceId, (countsByRace.get(comp.raceId) ?? 0) + 1);
    }
    return this.visibleRaces().map(race => ({
      race,
      count: countsByRace.get(race.id) ?? 0,
    }));
  });

  readonly boatEntries = computed((): BoatEntrySummary[] => {
    const competitors = this.filteredCompetitors();
    const racesById = new Map(this.visibleRaces().map(r => [r.id, r]));

    const boats = new Map<
      string,
      { comp: ResolvedRaceCompetitor; series: Map<string, number>; competitors: ResolvedRaceCompetitor[] }
    >();

    for (const comp of competitors) {
      const boatId = `${comp.boatClass}-${comp.sailNumber}`;
      if (!boats.has(boatId)) {
        boats.set(boatId, { comp, series: new Map<string, number>(), competitors: [] });
      }
      const boat = boats.get(boatId)!;
      boat.competitors.push(comp);
      const race = racesById.get(comp.raceId);
      if (race) {
        boat.series.set(race.seriesName, (boat.series.get(race.seriesName) || 0) + 1);
      }
    }

    return Array.from(boats.values())
      .map(({ comp, series, competitors: comps }) => ({
        boatId: `${comp.boatClass}-${comp.sailNumber}`,
        boatClass: comp.boatClass,
        sailNumber: comp.sailNumber,
        helm: comp.helm,
        competitors: comps,
        seriesSummaries: Array.from(series.entries())
          .map(([seriesName, raceCount]) => ({ seriesName, raceCount }))
          .sort((a, b) => a.seriesName.localeCompare(b.seriesName)),
      }))
      .sort(
        (a, b) =>
          a.boatClass.localeCompare(b.boatClass) ||
          a.sailNumber.toString().localeCompare(b.sailNumber.toString()),
      );
  });

  setViewScope(scope: EntriesViewScope): void {
    this.viewScope.set(scope);
  }

  formatRaceTitle(race: Race): string {
    return formatRaceTitle(race);
  }

  openDeleteDialog(boat: BoatEntrySummary): void {
    const racesById = new Map(this.visibleRaces().map((r: Race) => [r.id, r]));
    const rows: DeleteEntryRaceRow[] = boat.competitors
      .map(comp => {
        const race = racesById.get(comp.raceId);
        return {
          competitorId: comp.id,
          raceLabel: race ? formatRaceTitle(race) : comp.raceId,
          finished: !!(comp.manualFinishTime || comp.recordedFinishTime),
        };
      })
      .sort((a, b) => a.raceLabel.localeCompare(b.raceLabel));

    const boatLabel = `${boat.boatClass} ${boat.sailNumber} — ${boat.helm}`;
    const competitors = boat.competitors;

    this.dialog.open(DeleteEntryDialog, {
      width: '480px',
      maxWidth: '95vw',
      bindings: [
        inputBinding('boatLabel', () => boatLabel),
        inputBinding('races', () => rows),
        outputBinding<string[]>('delete', ids => void this.deleteCompetitors(competitors, ids)),
      ],
    });
  }

  private async deleteCompetitors(
    competitors: ResolvedRaceCompetitor[],
    competitorIds: string[],
  ): Promise<void> {
    if (competitorIds.length === 0) return;

    try {
      for (const competitorId of competitorIds) {
        const comp = competitors.find(c => c.id === competitorId);
        if (comp) {
          await this.mutator.deleteRaceCompetitor(comp);
        }
      }
    } catch (error: unknown) {
      this.snackbar.open('Error encountered deleting entries', 'Dismiss', { duration: 3000 });
      console.error('EntriesListPage: error deleting entries', error);
    }
  }
}
