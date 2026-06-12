import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBadge } from '@angular/material/badge';
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
import { CAPTURE_PROVIDERS } from '../../capture/capture.providers';
import { ResultsSheetCaptureService } from '../../capture';
import { HandicapInputPanel } from '../handicap/handicap-input-panel/handicap-input-panel';
import { HandicapResultsTable } from '../handicap/handicap-results-table/handicap-results-table';
import { RaceStartTimeDialog, type RaceStartTimeResult } from '../handicap/race-start-time-dialog';
import { PositionBasedInputPanel } from '../position-based/position-based-input-panel/position-based-input-panel';
import { MatTooltip } from '@angular/material/tooltip';

const SHEET_POPUP_NAME = 'scoring-sheet';
const SHEET_POPUP_FEATURES = 'popup,width=720,height=900';

@Component({
  selector: 'app-manual-results-page',
  templateUrl: './manual-results-page.html',
  styleUrls: ['./manual-results-page.scss'],
  providers: [...CAPTURE_PROVIDERS],
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
    MatBadge, 
    MatTooltip
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
  loadingImage = signal(false);

  readonly raceId = input<string>();

  /** Scoring sheet race selection (MVP: at most one id). */
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

  /** Reference to the pop-out window currently showing the scoring sheet image (null when none). */
  private readonly imageWindowRef = signal<Window | null>(null);
  /** True while the scoring-sheet pop-out window is open; used to colour the toolbar toggle. */
  protected readonly imageWindowOpen = computed(() => this.imageWindowRef() !== null);
  /** Resolved download URL for the selected race's `resultsSheetImage`. */
  private readonly sheetImageUrl = signal<string | null>(null);
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

    // Close any open pop-out and re-resolve the sheet image 
    // whenever the selected race changes.
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

  async displayOrCaptureImage(): Promise<void> {
    const race = this.selectedRace();
    if (!race) return;

    // If a popup is already open (named window), refocus it instead of doing
    // anything else 
    if (this.imageWindowOpen()) {
      try { this.imageWindowRef()?.focus(); } catch { /* ignore */ }
      return;
    }

    try {
      this.loadingImage.set(true);
      const result = await this.captureService.captureAndStore({
        clubId: this.clubTenant.clubId,
        raceId: race.id,
        isMobile: this.isMobile(),
        storedImagePath: race.resultsSheetImage?.trim() ?? null,
      });

      if (!result) return;
      await this.refreshSheetImageUrl(result.storagePath);
      const url = this.sheetImageUrl();
      if (url) this.openBrowserWindow(url);
    } finally {
      this.loadingImage.set(false);
    }
  }

  /**
   * Opens the scoring sheet image in a pop-out window. On mobile the `popup`
   * feature is dropped so the browser opens it as a tab (popups are
   * disruptive on phones). When the browser blocks the window (commonly
   * after an awaited capture/upload, which severs the original user
   * gesture), surface a snackbar with an "Open" action so the next click is
   * itself a fresh user gesture the popup blocker will allow through.
   */
  private openBrowserWindow(url: string): void {
    const win = this.tryOpenWindow(url);
    if (win) {
      return;
    }
    const ref = this.snackbar.open(
      'Pop-up blocked. Allow pop-ups for this site, or click Open to view the scoring sheet.',
      'Open',
      { duration: 8000 },
    );
    ref.onAction().subscribe(() => {
      this.tryOpenWindow(url);
    });
  }

  private tryOpenWindow(url: string): Window | null {
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
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: Race; }, RaceStartTimeResult>(RaceStartTimeDialog, {
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
