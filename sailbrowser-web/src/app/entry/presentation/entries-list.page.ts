import { ChangeDetectionStrategy, Component, computed, inject, inputBinding, outputBinding } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
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

@Component({
  selector: 'app-entries-list-page',
  imports: [
    Toolbar,
    LoadingCentered,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    CenteredText,
  ],
  template: `
    <app-toolbar title="Entries"></app-toolbar>
    <div class="content">
      <a matFab extended class="entry-button" [routerLink]="['/entry', 'enter']">
        Enter Races
      </a>

      @if (reader.loading()) {
        <app-loading-centered />
      } @else if (resolved().length === 0) {
        <app-centered-text>No entries yet</app-centered-text>
      } @else {
        <mat-list class="dense-list">
          @for (boat of boatEntries(); track boat.boatId) {
            <mat-list-item>
              <span matListItemTitle>
                <b class="gap">{{ boat.helm }}</b>
                <span class="gap">{{ boat.boatClass }} {{ boat.sailNumber }}</span>
              </span>
              <span matListItemLine>
                @for (summary of boat.seriesSummaries; track summary.seriesName) {
                  <span class="gap">{{ summary.seriesName }} {{ summary.raceCount }} race(s)</span>
                }
              </span>
              <span matListItemMeta>
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Delete entries"
                  (click)="openDeleteDialog(boat)"
                >
                  <mat-icon class="warning">delete</mat-icon>
                </button>
              </span>
            </mat-list-item>
          }
        </mat-list>
      }
    </div>
  `,
  styles: [`
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 400px);

    .entry-button {
      margin-top: 20px;
      margin-bottom: 20px;
      align-self: center;
    }

    .gap {
      margin-right: 14px;
    }

    .warning {
      color: var(--mat-sys-error);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntriesListPage {
  protected readonly reader = inject(RaceCompetitorReader);
  private readonly mutator = inject(RaceCompetitorMutator);
  private readonly currentRaces = inject(CurrentRaces);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);

  resolved = this.reader.selectedResolvedCompetitors;

  private readonly races = computed(() => this.currentRaces.selectedRaces());

  boatEntries = computed((): BoatEntrySummary[] => {
    const competitors = this.resolved();
    const races = this.races();
    const racesById = new Map(races.map(r => [r.id, r]));

    const boats = new Map<string, { comp: ResolvedRaceCompetitor; series: Map<string, number>; competitors: ResolvedRaceCompetitor[] }>();

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

    return Array.from(boats.values()).map(({ comp, series, competitors: comps }) => ({
      boatId: `${comp.boatClass}-${comp.sailNumber}`,
      boatClass: comp.boatClass,
      sailNumber: comp.sailNumber,
      helm: comp.helm,
      competitors: comps,
      seriesSummaries: Array.from(series.entries())
        .map(([seriesName, raceCount]) => ({ seriesName, raceCount }))
        .sort((a, b) => a.seriesName.localeCompare(b.seriesName)),
    })).sort((a, b) =>
      a.boatClass.localeCompare(b.boatClass) ||
      a.sailNumber.toString().localeCompare(b.sailNumber.toString()),
    );
  });

  openDeleteDialog(boat: BoatEntrySummary): void {
    const racesById = new Map(this.races().map((r: Race) => [r.id, r]));
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
