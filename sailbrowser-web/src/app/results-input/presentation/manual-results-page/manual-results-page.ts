import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBadge } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { openEntryDialog } from 'app/entry/presentation/entry-dialog/entry-dialog';
import { EventEntryService } from 'app/events/services/event-entry.service';
import { ScoringEngine } from 'app/published-results';
import { Race, RaceCalendarStore } from 'app/race-calendar';
import { RacePickerDialog, type RacePickerDialogData } from 'app/race-calendar/presentation/race-picker-dialog/race-picker-dialog';
import { CurrentRaces, RaceCompetitorReader, ResolvedRaceCompetitor } from 'app/results-input';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { BusyButton } from 'app/shared/components/busy-button';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { FIRESTORE_BULK_WRITE_TIMEOUT_MS, withTimeout } from 'app/shared/utils/with-timeout';
import { firstValueFrom, map } from 'rxjs';
import { RaceTitlePipe } from '../../../shared/pipes/race-title-pipe';
import { manualRaceTableSort, ManualResultsService } from '../../services/manual-results.service';
import { RaceDayActions } from '../../services/race-day-actions';
import { SheetCapturePane } from '../../capture/sheet-capture-pane/sheet-capture-pane';
import { ResultsSheetCaptureService } from '../../capture/services/results-sheet-capture.service';
import { SheetImage } from '../../capture/sheet-image/sheet-image';
import { SheetWorkspace } from '../../capture/sheet-workspace/sheet-workspace';
import { HandicapInputPanel } from '../handicap/handicap-input-panel/handicap-input-panel';
import { HandicapResultsTable } from '../handicap/handicap-results-table/handicap-results-table';
import { RaceStartTimeDialog, type RaceStartTimeResult } from '../handicap/race-start-time-dialog';
import { PositionBasedInputPanel } from '../position-based/position-based-input-panel/position-based-input-panel';
import { MatTooltip } from '@angular/material/tooltip';

/** What the scoring-sheet pane beside results entry shows. */
type SheetPane = 'closed' | 'view' | 'capture';

@Component({
  selector: 'app-manual-results-page',
  templateUrl: './manual-results-page.html',
  styleUrls: ['./manual-results-page.scss'],
  imports: [
    Toolbar,
    PageLayout,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatDialogModule,
    MatMenuModule,
    HandicapResultsTable,
    BusyButton,
    RaceTitlePipe,
    HandicapInputPanel,
    PositionBasedInputPanel,
    MatBadge,
    MatTooltip,
    SheetImage,
    SheetCapturePane,
    SheetWorkspace,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualResultsPage {
  private readonly reader = inject(RaceCompetitorReader);
  private readonly dialog = inject(MatDialog);
  protected readonly currentRacesStore = inject(CurrentRaces);
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly publishService = inject(ScoringEngine);
  private readonly manualResultsService = inject(ManualResultsService);
  private readonly captureService = inject(ResultsSheetCaptureService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly appBreakpoints = inject(AppBreakpoints);
  private readonly router = inject(Router);
  private message = inject(DialogsService);
  protected readonly raceDayActions = inject(RaceDayActions);
  private readonly eventEntries = inject(EventEntryService);

  publishing = signal(false);

  readonly raceId = input<string>();

  /**
   * Scoring sheet race selection (MVP: at most one id).
   * TODO(stage-2): allow multi-select for Level Rating races and adapt the position panel.
   */
  private readonly raceIds = signal<string[]>([]);

  readonly selectedRace = computed((): Race | undefined => {
    const id = this.raceIds()[0];
    if (!id) return undefined;
    return this.raceCalendarStore.allRaces().find(r => r.id === id);
  });

  readonly sortedCompetitors = computed(() => {
    const raceId = this.selectedRace()?.id;
    if (!raceId) return [];
    const resolved = this.reader.resolvedForRace(raceId);
    return [...resolved].sort((a, b) => manualRaceTableSort(a, b, 'elapsedTime', 'asc'));
  });

  readonly handicapSelectedCompetitor = linkedSignal<ResolvedRaceCompetitor | undefined>(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
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

  /** True on Handset breakpoint - collapse Camera/Publish/Results into an overflow menu. */
  protected readonly isMobile = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map(state => state.matches)),
    { initialValue: false },
  );

  protected readonly hasSheetImage = computed(() => !!this.selectedRace()?.resultsSheetImage?.trim());

  /**
   * Opens on the stored sheet when a race is selected on a wide screen; on a narrow screen
   * results entry stays in front until the sheet is asked for.
   */
  protected readonly sheetPane = linkedSignal<string | undefined, SheetPane>({
    source: () => this.selectedRace()?.id,
    computation: () =>
      untracked(() => (this.appBreakpoints.isWideLayout() && this.hasSheetImage() ? 'view' : 'closed')),
  });

  /** Resolved download URL for the selected race's `resultsSheetImage`. */
  protected readonly sheetImageUrl = signal<string | null>(null);
  protected readonly sheetImageLoading = signal(false);
  private sheetImageResolveVersion = 0;

  constructor() {
    effect(() => {
      const id = this.raceId();
      if (!id) return;
      untracked(() => {
        if (this.raceIds()[0] !== id) {
          this.raceIds.set([id]);
          this.currentRacesStore.addRaceId(id);
        }
      });
    });

    // Open the scoring sheet when screen is displayed with no 
    // statr time selected
    afterNextRender(() => {
      setTimeout(() => {
        if (!this.raceId() && this.raceIds().length === 0) {
          void this.openRaceDialog();
        }
      }, 0);
    });

    effect(() => {
      const race = this.selectedRace();
      const path = race?.resultsSheetImage?.trim() ?? '';
      untracked(() => {
        void this.refreshSheetImageUrl(path);
      });
    });

  }

  private async refreshSheetImageUrl(path: string): Promise<void> {
    const version = ++this.sheetImageResolveVersion;
    if (!path) {
      this.sheetImageUrl.set(null);
      this.sheetImageLoading.set(false);
      return;
    }
    this.sheetImageLoading.set(true);
    try {
      const url = await this.captureService.resolveDownloadUrl(path);
      if (version !== this.sheetImageResolveVersion) return;
      this.sheetImageUrl.set(url);
    } catch (err: unknown) {
      if (version !== this.sheetImageResolveVersion) return;
      this.sheetImageUrl.set(null);
      console.error('ManualResultsPage: failed to resolve resultsSheetImage', { path, err });
    } finally {
      if (version === this.sheetImageResolveVersion) this.sheetImageLoading.set(false);
    }
  }

  /** Toolbar action: view the stored sheet, or capture one when the race has none. */
  protected readonly sheetActionLabel = computed(() => {
    if (this.sheetPane() !== 'closed') return 'Hide scoring sheet';
    return this.hasSheetImage() ? 'View scoring sheet' : 'Capture scoring sheet';
  });

  toggleSheet(): void {
    if (this.sheetPane() !== 'closed') {
      this.sheetPane.set('closed');
      return;
    }
    this.sheetPane.set(this.hasSheetImage() ? 'view' : 'capture');
  }

  viewSheet(): void {
    this.sheetPane.set('view');
  }

  captureSheet(): void {
    this.sheetPane.set('capture');
  }

  onSheetOpenChange(open: boolean): void {
    if (!open) this.sheetPane.set('closed');
  }

  /** The new image keeps the race's storage path, so drop the old URL to reload the viewer. */
  async onSheetSaved(storagePath: string): Promise<void> {
    this.sheetImageUrl.set(null);
    this.sheetPane.set('view');
    await this.refreshSheetImageUrl(storagePath);
  }

  async openRaceDialog(): Promise<void> {
    const preselected = this.raceIds()[0];
    const dialogRef = this.dialog.open<RacePickerDialog, RacePickerDialogData, string[] | undefined>(RacePickerDialog, {
      width: 'min(92vw, 440px)',
      maxHeight: '90vh',
      data: {
        title: 'Select race on scoring sheet',
        preselectedRaceIds: preselected ? [preselected] : [],
        maxSelections: 1,
        requireSelection: true,
        availableFilters: ['past', 'hideCompleted'],
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    const id = result?.[0];
    if (id) {
      this.currentRacesStore.addRaceId(id);
      this.raceIds.set([id]);
    }
  }

  clearRace(): void {
    this.raceIds.set([]);
  }

  addEntryForSelectedRace(search = ''): void {
    const race = this.selectedRace();
    if (!race) return;
    openEntryDialog(
      this.dialog,
      { raceId: race.id, initialSearch: search.trim() || undefined },
      this.isMobile(),
    );
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
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: Race; }, RaceStartTimeResult>(RaceStartTimeDialog, {
      data: { race }
    });

    const result = await firstValueFrom(dialog.afterClosed());

    if (result) {
      try {
        await this.manualResultsService.setStartTime(race.id, result.starts, result.mode);
      } catch (e: unknown) {
        console.error('ManualResultsPage: setStartTime failed', e);
        const message = e instanceof Error ? e.message : 'Could not save start time.';
        this.message.message('Error saving start time', message);
        return undefined;
      }
    }

    return result;
  }
  /** Open-event boats are entered up front; ones that never came out are DNC, not unfinished. */
  readonly canMarkRemainingDnc = computed(() => {
    const race = this.selectedRace();
    if (!race || race.status === 'Canceled') return false;
    const series = this.raceCalendarStore.allSeries().find(s => s.id === race.seriesId);
    return !!series?.eventId && this.sortedCompetitors().some(c => c.resultCode === 'NOT FINISHED');
  });

  async markRemainingDnc(race: Race): Promise<void> {
    const remaining = this.sortedCompetitors().filter(c => c.resultCode === 'NOT FINISHED').length;
    const ok = await this.message.confirm(
      'Mark remaining as DNC?',
      `${remaining} ${remaining === 1 ? 'boat has' : 'boats have'} no result in this race and will be scored DNC.`,
      { confirm: 'Mark DNC' },
    );
    if (!ok) return;
    try {
      await this.eventEntries.markRemainingDnc(race);
    } catch (e: unknown) {
      console.error('ManualResultsPage: markRemainingDnc failed', e);
      this.message.message('Error marking DNC', e instanceof Error ? e.message : String(e));
    }
  }

  async publish() {
    if (this.selectedRace() && !this.publishing()) {
      const race = this.selectedRace()!;
      this.publishing.set(true);
      try {
        await withTimeout(
          this.publishService.publishRace(race),
          FIRESTORE_BULK_WRITE_TIMEOUT_MS,
          'Publishing results',
        );
      } catch (e: unknown) {
        const detail = e instanceof Error ? e.message : String(e);
        const msg = `Race: ${race.id} SeriesId ${race.seriesId}. ${detail}`;
        console.log('Manual results: Publishing results ' + msg);
        this.message.message('Error publishing results', msg);
      } finally {
        this.publishing.set(false);
      }
    }
  }
}
