import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { ScoringEngine } from 'app/published-results';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces, RaceCompetitor, RaceCompetitorStore } from 'app/results-input';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { BusyButton } from 'app/shared/components/busy-button';
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { firstValueFrom, startWith } from 'rxjs';
import { RaceTitlePipe } from '../../../shared/pipes/race-title-pipe';
import { manualRaceTableSort, ManualResultsService } from '../../services/manual-results.service';
import { HandicapInputPanel } from '../handicap/handicap-input-panel/handicap-input-panel';
import { HandicapResultsTable } from '../handicap/handicap-results-table/handicap-results-table';
import { RaceStartTimeDialog, type RaceStartTimeResult } from '../handicap/race-start-time-dialog';
import { PositionBasedInputPanel } from '../position-based/position-based-input-panel/position-based-input-panel';
import { MoreRacesDialog } from './more-races-dialog';

@Component({
  selector: 'app-manual-results-page',
  templateUrl: './manual-results-page.html',
  styleUrls: ['./manual-results-page.scss'],
  imports: [
    Toolbar,
    MatFormFieldModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatSelectModule,
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
  private readonly dialog = inject(MatDialog);
  protected readonly currentRacesStore = inject(CurrentRaces);
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly publishService = inject(ScoringEngine);
  private readonly manualResultsService = inject(ManualResultsService);
  private message = inject(DialogsService);

  publishing = signal(false);

  readonly raceId = input<string>();

  readonly raceFilterControl = new FormControl<string | null>(null);

  readonly selectedRaceId = toSignal(this.raceFilterControl.valueChanges.pipe(
    startWith(this.raceFilterControl.value),
  ),
  { initialValue: this.raceFilterControl.value });

  readonly selectedRace = computed(() =>
    this.currentRacesStore.selectedRaces().find(r => this.selectedRaceId() == r.id));

  readonly sortedCompetitors = computed(() => {
    const raceId = this.selectedRace()?.id;
    const comps = this.store.selectedCompetitors().filter(comp => raceId === comp.raceId);
    return [...comps].sort((a, b) => manualRaceTableSort(a, b, 'elapsedTime', 'asc'));
  });

  readonly handicapSelectedCompetitor = linkedSignal<RaceCompetitor | undefined>(() => {
    this.selectedRace()?.id;
    return undefined;
  });

  readonly handicapScheme = computed<HandicapScheme>(() => {
    const race = this.selectedRace();
    if (!race) return 'PY' as HandicapScheme;
    const series = this.raceCalendarStore.allSeries().find(s => s.id === race.seriesId);
    return series?.primaryScoringConfiguration.handicapScheme ?? ('PY' as HandicapScheme);
  });

  constructor() {
    effect(() => {
      const id = this.raceId();
      if (id && this.raceFilterControl.value !== id) {
        untracked(() => this.raceFilterControl.setValue(id));
      }
    });
  }

  onRaceSelectionChange(event: MatSelectChange) {
    if (event.value === 'MORE') {
      this.openMoreRacesDialog();
      this.raceFilterControl.setValue(null);
    }
  }

  async openMoreRacesDialog() {
    const dialogRef = this.dialog.open(MoreRacesDialog, {
      width: '400px',
      maxHeight: '80vh'
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      this.raceFilterControl.setValue(result);
    }
  }

  onTableRowClick(row: RaceCompetitor) {
    if (this.selectedRace()?.type !== 'Handicap') return;
    this.handicapSelectedCompetitor.set(row);
  }

  async setStartTime(race: Race): Promise<RaceStartTimeResult | undefined> {
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: Race }, RaceStartTimeResult>(RaceStartTimeDialog, {
      data: { race }
    });

    const result = await firstValueFrom(dialog.afterClosed());

    if (result) {
      await this.manualResultsService.setStartTime(race.id, result.startTime, result.mode);
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
