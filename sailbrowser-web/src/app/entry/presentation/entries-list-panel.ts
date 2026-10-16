import {
  Component,
  computed,
  inject,
  inputBinding,
  outputBinding,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'app/auth/auth.service';
import { Race } from 'app/race-calender';
import { ResolvedRaceCompetitor } from 'app/results-input';
import { CenteredText } from 'app/shared/components/centered-text';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { formatRaceTitle } from 'app/shared/pipes/race-title-pipe';
import { CurrentRaces } from '../../results-input/services/current-races-store';
import { RaceCompetitorMutator } from '../../results-input/services/race-competitor-mutator';
import { RaceCompetitorReader } from '../../results-input/services/race-competitor-reader';
import { DeleteEntryDialog, DeleteEntryRaceRow } from './delete-entry-dialog';

/** View filter only — loading covers selected ∪ upcoming races. */
export type EntriesViewScope = 'upcoming' | 'today' | 'current';

export interface BoatSeriesSummary {
  seriesName: string;
  raceCount: number;
}

export interface BoatEntrySummary {
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

/**
 * Shared entries list body (scope filter, race counts, boat list, delete).
 * Used by the Entries page and the kiosk Entries step.
 */
@Component({
  selector: 'app-entries-list-panel',
  imports: [
    LoadingCentered,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    CenteredText,
    MatCard,
  ],
  templateUrl: './entries-list-panel.html',
  styleUrl: './entries-list-panel.scss',
})
export class EntriesListPanel {
  protected readonly reader = inject(RaceCompetitorReader);
  private readonly mutator = inject(RaceCompetitorMutator);
  private readonly currentRaces = inject(CurrentRaces);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);

  /** Default: today through next 7 days (same window as self-entry). */
  readonly viewScope = signal<EntriesViewScope>('upcoming');

  readonly scopeLabel = computed(() => {
    switch (this.viewScope()) {
      case 'current':
        return 'Recent';
      case 'today':
        return 'Today';
      default:
        return 'Upcoming';
    }
  });

  private readonly visibleRaces = computed(() => {
    switch (this.viewScope()) {
      case 'today':
        return this.currentRaces.todaysRaces();
      case 'current':
        return this.currentRaces.selectedRaces();
      default:
        return this.currentRaces.upcomingRaces();
    }
  });

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

  /** RO can delete any unfinished entry; members only their own unfinished rows. */
  canDeleteBoat(boat: BoatEntrySummary): boolean {
    return this.deletableCompetitors(boat).length > 0;
  }

  openDeleteDialog(boat: BoatEntrySummary): void {
    const deletable = this.deletableCompetitors(boat);
    if (deletable.length === 0) {
      this.snackbar.open('You can only delete your own unfinished entries.', 'Dismiss', {
        duration: 4000,
      });
      return;
    }

    const racesById = new Map(this.visibleRaces().map((r: Race) => [r.id, r]));
    const rows: DeleteEntryRaceRow[] = deletable
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

    this.dialog.open(DeleteEntryDialog, {
      width: '480px',
      maxWidth: '95vw',
      bindings: [
        inputBinding('boatLabel', () => boatLabel),
        inputBinding('races', () => rows),
        outputBinding<string[]>('delete', ids => void this.deleteCompetitors(deletable, ids)),
      ],
    });
  }

  private deletableCompetitors(boat: BoatEntrySummary): ResolvedRaceCompetitor[] {
    const isRO = this.auth.isRaceOfficer();
    const uid = this.auth.user()?.uid;
    return boat.competitors.filter(comp => {
      const finished = !!(comp.manualFinishTime || comp.recordedFinishTime);
      if (finished) return false;
      if (isRO) return true;
      return !!uid && comp.enteredByUid === uid;
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
      console.error('EntriesListPanel: error deleting entries', error);
    }
  }
}
