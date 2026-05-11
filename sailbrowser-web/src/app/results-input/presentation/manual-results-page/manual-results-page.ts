import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { ScoringEngine } from 'app/published-results';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { RacePickerDialog, type RacePickerDialogData } from 'app/race-calender/presentation/race-picker-dialog/race-picker-dialog';
import { CurrentRaces, RaceCompetitorReader, ResolvedRaceCompetitor } from 'app/results-input';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { BusyButton } from 'app/shared/components/busy-button';
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { firstValueFrom, map } from 'rxjs';
import { RaceTitlePipe } from '../../../shared/pipes/race-title-pipe';
import { manualRaceTableSort, ManualResultsService } from '../../services/manual-results.service';
import { ResultsSheetCaptureService } from '../../services/results-sheet-capture.service';
import { HandicapInputPanel } from '../handicap/handicap-input-panel/handicap-input-panel';
import { HandicapResultsTable } from '../handicap/handicap-results-table/handicap-results-table';
import { RaceStartTimeDialog, type RaceStartTimeResult } from '../handicap/race-start-time-dialog';
import { PositionBasedInputPanel } from '../position-based/position-based-input-panel/position-based-input-panel';

const SHEET_POPUP_NAME = 'scoring-sheet';
const SHEET_POPUP_FEATURES = 'popup,width=720,height=900';
const SHEET_POPUP_POLL_MS = 750;

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
    MatMenuModule,
    HandicapResultsTable,
    BusyButton,
    RaceTitlePipe,
    HandicapInputPanel,
    PositionBasedInputPanel,
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
  private readonly clubTenant = inject(ClubTenant);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
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

  /** Reference to the pop-out window currently showing the scoring sheet (null when none). */
  private readonly sheetWindowRef = signal<Window | null>(null);
  /** True while the scoring-sheet pop-out window is open; used to colour the toolbar toggle. */
  protected readonly sheetWindowOpen = computed(() => this.sheetWindowRef() !== null);
  /** Resolved download URL for the selected race's `resultsSheetImage`. */
  private readonly sheetImageUrl = signal<string | null>(null);
  private sheetImageResolveVersion = 0;
  private sheetWindowPollTimer: ReturnType<typeof setInterval> | null = null;

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

    // Close any open pop-out and re-resolve the sheet image whenever the selected race changes.
    effect(() => {
      const race = this.selectedRace();
      const path = race?.resultsSheetImage?.trim() ?? '';
      untracked(() => {
        this.closeSheetWindow();
        void this.refreshSheetImageUrl(path);
      });
    });

    this.destroyRef.onDestroy(() => this.closeSheetWindow());
  }

  private async refreshSheetImageUrl(path: string): Promise<void> {
    const version = ++this.sheetImageResolveVersion;
    if (!path) {
      this.sheetImageUrl.set(null);
      return;
    }
    try {
      const url = await this.captureService.resolveDownloadUrl(path);
      if (version !== this.sheetImageResolveVersion) return;
      this.sheetImageUrl.set(url);
    } catch (err: unknown) {
      if (version !== this.sheetImageResolveVersion) return;
      this.sheetImageUrl.set(null);
      console.error('ManualResultsPage: failed to resolve resultsSheetImage', { path, err });
    }
  }

  async openScoringSheet(): Promise<void> {
    const race = this.selectedRace();
    if (!race) return;

    // If a popup is already open (named window), refocus it instead of doing
    // anything else - clicking the toolbar button should behave like any other
    // "open" action.
    if (this.sheetWindowOpen()) {
      try { this.sheetWindowRef()?.focus(); } catch { /* ignore */ }
      return;
    }

    if (race.resultsSheetImage?.trim()) {
      // Image already stored - resolve a URL (if not cached yet) then pop it open.
      let url = this.sheetImageUrl();
      if (!url) {
        await this.refreshSheetImageUrl(race.resultsSheetImage.trim());
        url = this.sheetImageUrl();
      }
      if (url) this.openSheetWindow(url);
      return;
    }

    // No image yet - capture, persist, resolve a URL, then pop it open.
    const result = await this.captureService.captureAndStore({
      clubId: this.clubTenant.clubId,
      raceId: race.id,
      isMobile: this.isMobile(),
    });
    if (!result) return;
    await this.refreshSheetImageUrl(result.storagePath);
    const url = this.sheetImageUrl();
    if (url) this.openSheetWindow(url);
  }

  /**
   * Opens the scoring sheet image in a pop-out window. On mobile the `popup`
   * feature is dropped so the browser opens it as a tab (popups are
   * disruptive on phones). When the browser blocks the window (commonly
   * after an awaited capture/upload, which severs the original user
   * gesture), surface a snackbar with an "Open" action so the next click is
   * itself a fresh user gesture the popup blocker will allow through.
   */
  private openSheetWindow(url: string): void {
    const win = this.tryOpenSheetWindow(url);
    if (win) {
      this.adoptSheetWindow(win);
      return;
    }
    const ref = this.snackbar.open(
      'Pop-up blocked. Allow pop-ups for this site, or click Open to view the scoring sheet.',
      'Open',
      { duration: 8000 },
    );
    ref.onAction().subscribe(() => {
      const retry = this.tryOpenSheetWindow(url);
      if (retry) {
        this.adoptSheetWindow(retry);
      }
    });
  }

  private tryOpenSheetWindow(url: string): Window | null {
    const features = this.isMobile() ? undefined : SHEET_POPUP_FEATURES;
    try {
      const popup = window.open(url, SHEET_POPUP_NAME, features);
      if (popup) return popup;
      // If a popup was requested but blocked, try once more as a plain tab.
      return features ? window.open(url, SHEET_POPUP_NAME) : null;
    } catch {
      return null;
    }
  }

  private adoptSheetWindow(win: Window): void {
    try { win.focus(); } catch { /* ignore */ }
    this.sheetWindowRef.set(win);
    this.startSheetWindowPolling();
  }

  /** Closes the pop-out (if any) and clears the tracked reference. */
  private closeSheetWindow(): void {
    const win = this.sheetWindowRef();
    if (win && !win.closed) {
      try { win.close(); } catch { /* ignore */ }
    }
    this.sheetWindowRef.set(null);
    this.stopSheetWindowPolling();
  }

  /** Polls the popup's `closed` flag so we can clear our reference when the user closes it externally. */
  private startSheetWindowPolling(): void {
    this.stopSheetWindowPolling();
    this.sheetWindowPollTimer = setInterval(() => {
      const win = this.sheetWindowRef();
      if (!win || win.closed) {
        this.sheetWindowRef.set(null);
        this.stopSheetWindowPolling();
      }
    }, SHEET_POPUP_POLL_MS);
  }

  private stopSheetWindowPolling(): void {
    if (this.sheetWindowPollTimer !== null) {
      clearInterval(this.sheetWindowPollTimer);
      this.sheetWindowPollTimer = null;
    }
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
        availableFilters: ['past', 'hideCompleted'],
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
