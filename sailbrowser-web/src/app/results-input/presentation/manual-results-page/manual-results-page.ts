import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ScoringEngine } from 'app/published-results';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { RacePickerDialog, type RacePickerDialogData } from 'app/race-calender/presentation/race-picker-dialog/race-picker-dialog';
import {
  CurrentRaces,
  RaceCompetitorStore,
  ResolvedRaceCompetitor,
  resolveRaceCompetitors,
  SeriesEntryStore,
} from 'app/results-input';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { BusyButton } from 'app/shared/components/busy-button';
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { firstValueFrom } from 'rxjs';
import { RaceTitlePipe } from '../../../shared/pipes/race-title-pipe';
import { manualRaceTableSort, ManualResultsService } from '../../services/manual-results.service';
import { HandicapInputPanel } from '../handicap/handicap-input-panel/handicap-input-panel';
import { HandicapResultsTable } from '../handicap/handicap-results-table/handicap-results-table';
import { RaceStartTimeDialog, type RaceStartTimeResult } from '../handicap/race-start-time-dialog';
import { PositionBasedInputPanel } from '../position-based/position-based-input-panel/position-based-input-panel';
@Component({
  selector: 'app-manual-results-page',
  templateUrl: './manual-results-page.html',
  styleUrls: ['./manual-results-page.scss'],
  imports: [
    Toolbar,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatDialogModule,
    HandicapResultsTable,
    BusyButton,
    RaceTitlePipe,
    HandicapInputPanel,
    PositionBasedInputPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualResultsPage {
  private readonly store = inject(RaceCompetitorStore);
  private readonly entryStore = inject(SeriesEntryStore);
  private readonly dialog = inject(MatDialog);
  protected readonly currentRacesStore = inject(CurrentRaces);
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly publishService = inject(ScoringEngine);
  private readonly manualResultsService = inject(ManualResultsService);
  private readonly router = inject(Router);
  private message = inject(DialogsService);

  publishing = signal(false);

  readonly raceId = input<string>();

  /** Scoring sheet race selection (MVP: at most one id). */
  private readonly scoringSheetRaceIds = signal<string[]>([]);

  readonly selectedRace = computed((): Race | undefined => {
    const id = this.scoringSheetRaceIds()[0];
    if (!id) return undefined;
    return this.raceCalendarStore.allRaces().find(r => r.id === id);
  });

  readonly sortedCompetitors = computed(() => {
    const raceId = this.selectedRace()?.id;
    const comps = this.store.selectedCompetitors().filter(comp => raceId === comp.raceId);
    const resolved = resolveRaceCompetitors(comps, this.entryStore.selectedEntries());
    return [...resolved].sort((a, b) => manualRaceTableSort(a, b, 'elapsedTime', 'asc'));
  });

  readonly handicapSelectedCompetitor = linkedSignal<ResolvedRaceCompetitor | undefined>(() => {
    this.selectedRace()?.id;
    return undefined;
  });

  readonly handicapScheme = computed<HandicapScheme>(() => {
    const race = this.selectedRace();
    if (!race) return 'PY' as HandicapScheme;
    const series = this.raceCalendarStore.allSeries().find(s => s.id === race.seriesId);
    return series?.primaryScoringConfiguration.handicapScheme ?? ('PY' as HandicapScheme);
  });
  readonly handicapInputPanel = viewChild(HandicapInputPanel);

  constructor() {
    effect(() => {
      const id = this.raceId();
      if (!id) return;
      untracked(() => {
        if (this.scoringSheetRaceIds()[0] !== id) {
          this.scoringSheetRaceIds.set([id]);
          this.currentRacesStore.addRaceId(id);
        }
      });
    });

    afterNextRender(() => {
      setTimeout(() => {
        if (!this.raceId() && this.scoringSheetRaceIds().length === 0) {
          void this.openScoringSheetRacePicker();
        }
      }, 0);
    });
  }

  async openScoringSheetRacePicker(): Promise<void> {
    const preselected = this.scoringSheetRaceIds()[0];
    const dialogRef = this.dialog.open<RacePickerDialog, RacePickerDialogData, string[] | undefined>(RacePickerDialog, {
      width: 'min(92vw, 440px)',
      maxHeight: '90vh',
      data: {
        title: 'Select race on scoring sheet',
        preselectedRaceIds: preselected ? [preselected] : [],
        maxSelections: 1,
        requireSelection: true,
        mode: 'results',
        defaultPeriod: 'today',
        availablePeriods: ['today', 'past'],
        hideIncompleteDefault: true,
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    const id = result?.[0];
    if (id) {
      this.currentRacesStore.addRaceId(id);
      this.scoringSheetRaceIds.set([id]);
    }
  }

  clearScoringSheetRace(): void {
    this.scoringSheetRaceIds.set([]);
  }

  async addEntryForSelectedRace(): Promise<void> {
    const race = this.selectedRace();
    if (!race) return;
    this.currentRacesStore.addRaceId(race.id);
    await this.router.navigate(['entry', 'enter'], {
      queryParams: {
        raceId: race.id,
        returnTo: 'results-input',
      },
    });
  }

  async viewResultsForSelectedRace(): Promise<void> {
    const race = this.selectedRace();
    if (!race) return;
    await this.router.navigate(['/results/viewer', race.seriesId], {
      queryParams: {
        raceId: race.id,
      },
    });
  }

  async onTableRowClick(row: ResolvedRaceCompetitor) {
    if (this.selectedRace()?.type !== 'Handicap') return;
    const panel = this.handicapInputPanel();
    if (panel) {
      await panel.setSelectedCompetitor(row);
      return;
    }
    this.handicapSelectedCompetitor.set(row);
  }

  async setStartTime(race: Race): Promise<RaceStartTimeResult | undefined> {
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: Race }, RaceStartTimeResult>(RaceStartTimeDialog, {
      data: { race }
    });

    const result = await firstValueFrom(dialog.afterClosed());

    if (result) {
      await this.manualResultsService.setStartTime(race.id, result.starts, result.mode);
    }

    return result;
  }

  async publish() {
    if (this.selectedRace() && !this.publishing()) {
      const race = this.selectedRace()!;
      this.publishing.set(true);
      try {
        await this.publishService.publishRace(race);
      } catch (e: unknown) {
        const msg = 'Manual results: Publishing results' +
          `Race: ${race.id} SeriesId ${race.seriesId}. ${e}`;
        console.log(msg);
        this.message.message("Error publihing results", msg);
      } finally {
        this.publishing.set(false);
      }
    }
  }
}
