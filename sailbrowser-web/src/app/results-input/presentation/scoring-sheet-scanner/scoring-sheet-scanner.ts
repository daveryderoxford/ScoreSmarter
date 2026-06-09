import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectorRef, Component, computed, effect, inject, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { Router } from '@angular/router';
import type { ScanStrategy, ScannerTimeFormat } from '@shared/scanner-context';
import { BoatsStore } from 'app/boats';
import { normalizeSailNumber, sailNumbersEqual } from 'app/boats/model/sail-number';
import { ClubStore } from 'app/club-tenant';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { RESULT_CODES, ResultCode } from 'app/scoring/model/result-code-scoring';
import { Toolbar } from "app/shared/components/toolbar";
import { normaliseString } from 'app/shared/utils/string-utils';
import { format } from 'date-fns';
import { firstValueFrom } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { CurrentRaces } from '../../services/current-races-store';
import { ManualResultsService } from '../../services/manual-results.service';
import { RaceCompetitorReader } from '../../services/race-competitor-reader';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { ResultsSheetCaptureService } from '../../services/results-sheet-capture.service';
import { RaceStartTimeDialog, RaceStartTimeResult } from '../handicap/race-start-time-dialog';
import { CameraCaptureDialog } from './camera-capture-dialog';
import { CaptureStep, CaptureStepMode, CaptureStepViewModel } from './capture-step/capture-step';
import { KnownBoatEntryDialog, KnownBoatEntryDialogResult } from './known-boat-entry-dialog';
import { PhoneCaptureQrDialog, PhoneCaptureQrDialogResult } from './phone-capture-qr-dialog/phone-capture-qr-dialog';
import { RaceStep } from './race-step/race-step';
import { MatchedRowVm, ReviewStep, UnmatchedRowVm, AcceptanceChangedEvent } from './review-step/review-step';
import {
  CaptureImage,
  ScanResponse,
  ScannedResultRow,
  ScannerContext,
  capturePreviewUrl,
  isCaptureReady,
  toScanRunFields,
} from './scan-model';
import { ScannerOrchestrationService } from './scanner-orchestration.service';
import { SetupStep } from './setup-step/setup-step';
import {
  UnmatchedRowEntryDialog,
  type UnmatchedRowEntryDialogResult,
} from './unmatched-row-entry-dialog';

@Component({
  selector: 'app-scoring-sheet-scanner',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatStepperModule,
    MatCardModule,
    MatIconModule,
    RaceStep,
    SetupStep,
    CaptureStep,
    ReviewStep,
    MatButtonModule,
    Toolbar
  ],
  templateUrl: './scoring-sheet-scanner.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './scoring-sheet-scanner.scss',
})
export class ScoringSheetScanner {
  private readonly allowedResultCodes = new Set<string>(RESULT_CODES as readonly string[]);

  private normalizeScannedResultCode(rawStatus?: string): ResultCode {
    const status = rawStatus?.trim().toUpperCase();
    if (!status) return 'OK';
    return this.allowedResultCodes.has(status) ? (status as ResultCode) : 'OK';
  }

  private hasConfiguredStarts(race: Race): boolean {
    return !!race.actualStart || !!race.starts?.length;
  }

  async setStartTimesForSelectedRace(): Promise<boolean> {
    const race = this.selectedRace();
    if (!race) {
      this.error.set('Select a race first.');
      return false;
    }
    const dialog = this.dialog.open<RaceStartTimeDialog, { race: Race }, RaceStartTimeResult>(RaceStartTimeDialog, {
      data: { race },
    });
    const result = await firstValueFrom(dialog.afterClosed());
    if (!result) return false;
    await this.manualResultsService.setStartTime(race.id, result.starts, result.mode);
    this.error.set(null);
    return true;
  }

  private async ensureStartTimesConfigured(): Promise<boolean> {
    const race = this.selectedRace();
    if (!race) {
      this.error.set('Select a race first.');
      return false;
    }
    if (this.hasConfiguredStarts(race)) return true;
    this.error.set('Set race start time(s) before saving accepted results.');
    return this.setStartTimesForSelectedRace();
  }

  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly currentRacesStore = inject(CurrentRaces);
  private readonly competitorStore = inject(RaceCompetitorStore);
  private readonly competitorReader = inject(RaceCompetitorReader);
  private readonly boatsStore = inject(BoatsStore);
  private readonly clubTenant = inject(ClubTenant);
  private readonly clubStore = inject(ClubStore);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly scannerOrchestration = inject(ScannerOrchestrationService);
  private readonly captureService = inject(ResultsSheetCaptureService);
  private readonly manualResultsService = inject(ManualResultsService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly isMobile = computed(() => this.breakpointObserver.isMatched('(max-width: 599px)'));
  stepper = viewChild.required<MatStepper>('stepper');

  form = this.fb.nonNullable.group({
    raceId: ['', Validators.required],
    listOrder: ['chronological', Validators.required],
    timeFormat: this.fb.nonNullable.control<ScannerTimeFormat>('clock_hms', Validators.required),
    lapsPresentOnSheet: this.fb.nonNullable.control(true, Validators.required),
    lapFormat: ['numbers', Validators.required],
    defaultHour: [10, [Validators.min(0), Validators.max(23)]],
    defaultLaps: [1, [Validators.min(1), Validators.max(100)]],
    scanStrategy: this.fb.nonNullable.control<ScanStrategy>('FullAIScan', Validators.required),
  });
  captureForm = this.fb.nonNullable.group({
    hasImage: [false, Validators.requiredTrue],
  });

  private readonly selectedRaceId = toSignal(
    this.form.controls.raceId.valueChanges.pipe(startWith(this.form.controls.raceId.value)),
    { initialValue: this.form.controls.raceId.value }
  );
  readonly selectedRace = computed(() => this.raceCalendarStore.allRaces().find((r: Race) => r.id === this.selectedRaceId()));
  private readonly raceStoredPath = computed(() => this.selectedRace()?.resultsSheetImage?.trim() ?? null);
  /** User chose "Capture new image" instead of the race's stored sheet for this visit. */
  private readonly dismissedStoredRaceSheet = signal(false);
  raceSheetImageUrl = signal<string | null>(null);
  raceSheetImageLoadError = signal<string | null>(null);
  private raceSheetImageResolveVersion = 0;

  readonly captureReady = computed(() => isCaptureReady(this.captureImage()));

  readonly captureMode = computed((): CaptureStepMode => {
    const img = this.captureImage();
    const racePath = this.raceStoredPath();
    if (!img) return 'empty';
    if (img.kind === 'inline') return 'newPreview';
    if (
      img.kind === 'storagePath' &&
      racePath &&
      !this.dismissedStoredRaceSheet() &&
      img.path === racePath
    ) {
      return 'stored';
    }
    return 'newPreview';
  });

  readonly captureViewModel = computed((): CaptureStepViewModel => {
    const img = this.captureImage();
    const mode = this.captureMode();
    const previewSrc =
      img?.kind === 'storagePath'
        ? this.raceSheetImageUrl()
        : capturePreviewUrl(img);
    const storedImageError = this.raceSheetImageLoadError();
    return {
      mode,
      isMobile: this.isMobile(),
      previewSrc,
      storedImageError,
      previewLoading:
        this.captureReady() &&
        img?.kind === 'storagePath' &&
        !previewSrc &&
        !storedImageError,
    };
  });
  readonly hasConfiguredStartTimes = computed(() => {
    const race = this.selectedRace();
    return !!race && this.hasConfiguredStarts(race);
  });
  readonly raceOptions = computed(() => this.raceCalendarStore.allRaces());
  readonly selectedRaceIds = computed(() => {
    const raceId = this.selectedRaceId();
    return raceId ? [raceId] : [];
  });
  readonly startTimesSummary = computed(() => {
    const race = this.selectedRace();
    if (!race) {
      return {
        title: 'Start Times',
        configured: false,
        lines: ['Select a race to configure start times.'],
      };
    }
    const starts = race.starts ?? [];
    if (starts.length > 0) {
      return {
        title: 'Start Times',
        configured: true,
        lines: starts.map((start, index) => {
          const fleetLabel = start.fleetId ? this.getFleetName(start.fleetId) : `Start ${index + 1}`;
          return `${fleetLabel}: ${this.formatTimeOnly(start.timeOfDay)}`;
        }),
      };
    }
    if (race.actualStart) {
      return {
        title: 'Start Times',
        configured: true,
        lines: [`Actual start: ${this.formatTimeOnly(race.actualStart)}`],
      };
    }
    return {
      title: 'Start Times',
      configured: false,
      lines: ['No start times configured.'],
    };
  });

  captureImage = signal<CaptureImage | null>(null);
  loading = signal(false);
  result = signal<ScanResponse | null>(null);
  /** Parsed scan persisted for the selected race (from Firestore). */
  storedScanOffer = signal<ScanResponse | null>(null);
  loadingStoredScan = signal(false);
  error = signal<string | null>(null);
  scanStage = signal<string | null>(null);

  readonly matchedResults = computed(() => this.result()?.scannedResults.filter(r => !!r.matchedCompetitorId) ?? []);
  
  private readonly resolvedByCompetitorId = computed(() =>
    new Map(this.competitorReader.selectedResolvedCompetitors().map(r => [r.id, r] as const)),
  );

  readonly matchedRows = computed<MatchedRowVm[]>(() =>
    this.matchedResults().map(row => {
      const competitor = row.matchedCompetitorId ? this.resolvedByCompetitorId().get(row.matchedCompetitorId) : undefined;
      return { row, helm: competitor?.helm, competitor };
    }),
  );

  readonly unmatchedResults = computed(() => this.result()?.scannedResults.filter(r => !r.matchedCompetitorId) ?? []);
  
  readonly unmatchedRows = computed<UnmatchedRowVm[]>(() =>
    this.unmatchedResults().map(row => {
      const classMatches =
        !row.boatClass?.value?.trim() ||
        this.clubStore.club().classes.some(c => boatClassesMatch(c.name, row.boatClass?.value));
      const boatMatches = this.findBoatMatches(row);
      const helms = Array.from(new Set(boatMatches.map(m => m.helm).filter((h): h is string => !!h && h.trim().length > 0)));
      return { 
        row, 
        matchedBoat: boatMatches.length > 0, 
        possibleHelms: helms, 
        matchedClass: classMatches
      };
    }),
  );

  readonly displayedColumns = ['accept', 'sailNumber', 'boatClass', 'helm', 'time', 'status', 'laps', 'overall'];
  readonly unmatchedColumns = ['sailNumber', 'boatClass', 'time', 'status', 'laps', 'helms', 'enter'];
  private findBoatMatches(row: ScannedResultRow) {
    const boatClass = row.boatClass?.value;
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!boatClass?.trim() || !sailNumber) return [];
    const scannedClass = normaliseBoatClassForMatch(boatClass);
    return this.boatsStore.boats().filter(
      b =>
        normaliseBoatClassForMatch(b.boatClass) === scannedClass &&
        sailNumbersEqual(b.sailNumber, sailNumber),
    );
  }

  constructor() {
    this.form.controls.raceId.valueChanges.subscribe(raceId => {
      this.applyRaceStoredImageIfAny();
      this.result.set(null);
      this.error.set(null);
      void this.loadStoredScanOffer(raceId);
    });
    effect(() => {
      const img = this.captureImage();
      const path =
        img?.kind === 'storagePath'
          ? img.path
          : (this.raceStoredPath() ?? '');
      void this.resolveRaceSheetImageUrl(path);
    });

    this.applyRaceStoredImageIfAny();
    const initialRaceId = this.form.controls.raceId.value;
    if (initialRaceId) {
      void this.loadStoredScanOffer(initialRaceId);
    }
  }

  private syncCaptureFormValidity(): void {
    this.captureForm.controls.hasImage.setValue(this.captureReady());
  }

  private applyRaceStoredImageIfAny(): void {
    this.dismissedStoredRaceSheet.set(false);
    const path = this.raceStoredPath();
    this.captureImage.set(path ? { kind: 'storagePath', path } : null);
    this.syncCaptureFormValidity();
  }

  startNewCapture(): void {
    this.dismissedStoredRaceSheet.set(true);
    this.captureImage.set(null);
    this.result.set(null);
    this.error.set(null);
    this.syncCaptureFormValidity();
  }

  private async resolveRaceSheetImageUrl(imageRef: string): Promise<void> {
    const resolveVersion = ++this.raceSheetImageResolveVersion;
    try {
      const url = await this.captureService.resolveDownloadUrl(imageRef);
      if (resolveVersion !== this.raceSheetImageResolveVersion) return;
      this.raceSheetImageUrl.set(url);
      this.raceSheetImageLoadError.set(null);
    } catch (err: unknown) {
      if (resolveVersion !== this.raceSheetImageResolveVersion) return;
      this.raceSheetImageUrl.set(null);
      this.raceSheetImageLoadError.set("Could not load race image from storage path: " + imageRef);
      console.error("ScoringSheetScanner: Failed to resolve resultsSheetImage to download URL", { imageRef, err });
    }
  }

  private formatTimeOnly(value: Date): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return format(date, 'HH:mm:ss');
  }

  private getFleetName(fleetId: string): string {
    const fleet = this.clubStore.club().fleets.find(f => f.id === fleetId);
    return fleet ? getFleetName(fleet) : `Fleet ${fleetId}`;
  }

  onScannerRaceIdsChange(ids: string[]): void {
    const id = ids[0] ?? '';
    this.form.controls.raceId.setValue(id);
    if (id) {
      this.currentRacesStore.addRaceId(id);
    }
  }

  private async loadStoredScanOffer(raceId: string): Promise<void> {
    if (!raceId) {
      this.storedScanOffer.set(null);
      return;
    }
    this.loadingStoredScan.set(true);
    try {
      const stored = await this.scannerOrchestration.getScanResponse(this.clubTenant.clubId, raceId);
      this.storedScanOffer.set(stored);
    } catch (err: unknown) {
      console.error('ScoringSheetScanner: failed to load stored scan', err);
      this.storedScanOffer.set(null);
    } finally {
      this.loadingStoredScan.set(false);
    }
  }

  processExistingScan(): void {
    const stored = this.storedScanOffer();
    if (!stored) return;
    this.result.set(this.scannerOrchestration.prepareScanResponseForReview(stored));
    this.error.set(null);
    this.captureForm.controls.hasImage.setValue(true);
    queueMicrotask(() => {
      this.markPriorStepsCompleted(2);
      const stepper = this.stepper();
      stepper.selectedIndex = 3;
      this.cdr.markForCheck();
    });
  }

  async discardScanAndContinue(): Promise<void> {
    const raceId = this.form.controls.raceId.value;
    if (!raceId) return;
    try {
      await this.scannerOrchestration.clearScanResponse(this.clubTenant.clubId, raceId);
      this.storedScanOffer.set(null);
      this.result.set(null);
      this.error.set(null);
      this.applyRaceStoredImageIfAny();
      queueMicrotask(() => {
        this.stepper().selectedIndex = 1;
        this.cdr.markForCheck();
      });
    } catch (err: unknown) {
      console.error('ScoringSheetScanner: failed to clear stored scan', err);
      this.error.set('Could not discard the saved scan. Please try again.');
    }
  }

  private markPriorStepsCompleted(lastIndex: number): void {
    const steps = this.stepper().steps;
    for (let i = 0; i <= lastIndex && i < steps.length; i++) {
      steps.get(i)!.completed = true;
    }
  }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return this.clearImage();
    this.dismissedStoredRaceSheet.set(true);
    this.result.set(null);
    this.error.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      const readResult = reader.result as string;
      this.captureImage.set({
        kind: 'inline',
        base64: readResult.split(',')[1],
        mimeType: file.type,
        previewUrl: readResult,
      });
      this.syncCaptureFormValidity();
    };
    reader.readAsDataURL(file);
  }

  clearImage(): void {
    this.result.set(null);
    this.error.set(null);

    if (!this.dismissedStoredRaceSheet()) {
      const path = this.raceStoredPath();
      if (path) {
        this.captureImage.set({ kind: 'storagePath', path });
        this.syncCaptureFormValidity();
        return;
      }
    }
    this.captureImage.set(null);
    this.syncCaptureFormValidity();
  }

  openCameraDialog(): void {
    const dialogRef = this.dialog.open(CameraCaptureDialog, { width: '800px', maxWidth: '95vw', disableClose: true });
    dialogRef.afterClosed().subscribe(result => {
      if (!result) return;
      this.dismissedStoredRaceSheet.set(true);
      this.captureImage.set({
        kind: 'inline',
        base64: result.base64,
        mimeType: 'image/jpeg',
        previewUrl: result.preview,
      });
      this.syncCaptureFormValidity();
    });
  }

  async onStepChange(event: { selectedIndex: number; previouslySelectedIndex?: number; }): Promise<void> {
    if (event.selectedIndex === 1) {
      if (event.previouslySelectedIndex === 0) {
        this.applyRaceStoredImageIfAny();
      }
      const img = this.captureImage();
      if (img?.kind === 'storagePath' && !this.raceSheetImageUrl()) {
        void this.resolveRaceSheetImageUrl(img.path);
      }
    }

    if (event.selectedIndex !== 3) return;
    if (!this.captureReady()) return;
    if (this.loading()) return;
    if (this.result()) return;
    await this.scan();
  }

  async startPhoneCapture(): Promise<void> {
    const raceId = this.form.controls.raceId.value;
    if (!raceId) {
      this.error.set('Select a race before starting phone capture.');
      return;
    }
    const ref = this.dialog.open<PhoneCaptureQrDialog, { clubId: string; raceId: string }, PhoneCaptureQrDialogResult | undefined>(
      PhoneCaptureQrDialog,
      {
        width: '420px',
        maxWidth: '95vw',
        disableClose: true,
        data: { clubId: this.clubTenant.clubId, raceId },
      },
    );
    const result = await firstValueFrom(ref.afterClosed());
    if (result?.outcome === 'uploaded') this.applyUploadedImageFromPhoneSession(result.storagePath);
  }

  private applyUploadedImageFromPhoneSession(storagePath: string): void {
    this.result.set(null);
    this.error.set(null);
    this.captureImage.set({ kind: 'storagePath', path: storagePath });
    this.syncCaptureFormValidity();
    this.advanceCaptureStepAfterPhoneUpload();
  }

  /** Move to Details after phone upload — user already saw the image on the phone. */
  private advanceCaptureStepAfterPhoneUpload(): void {
    if (this.stepper().selectedIndex !== 1) return;
    queueMicrotask(() => {
      const stepper = this.stepper();
      if (stepper.selectedIndex !== 1) return;
      if (this.captureForm.invalid) return;
      this.cdr.markForCheck();
      stepper.next();
    });
  }

  private parseScannedTime(timeStr: string): Date | null {
    const race = this.selectedRace();
    if (!timeStr || !race) return null;
    const normalized = timeStr
      .trim()
      .replace(/[^\d]/g, ':')
      .replace(/:+/g, ':')
      .replace(/^:|:$/g, '');
    const parts = normalized
      .split(':')
      .map(p => parseInt(p, 10))
      .filter(p => Number.isFinite(p));
    if (parts.length < 2 || parts.length > 3) return null;
    const date = new Date(race.scheduledStart);
    if (parts.length === 3) date.setHours(parts[0], parts[1], parts[2], 0);
    else if (parts.length === 2 && this.form.value.timeFormat === 'clock_hms') date.setHours(this.form.value.defaultHour ?? 14, parts[0], parts[1], 0);
    else if (parts.length === 2) date.setHours(0, parts[0], parts[1], 0);
    else return null;
    return date;
  }

  private refreshScanRowMatch(row: ScannedResultRow, boatClass: string, sailNumber: string, helm?: string): void {
    const raceId = this.form.value.raceId;
    if (!raceId) return;
    const match = this.competitorReader.resolvedForRace(raceId).find(r => {
      const classMatch = boatClassesMatch(r.boatClass, boatClass);
      const sailMatch = sailNumbersEqual(r.sailNumber, sailNumber);
      const helmMatch = !helm || r.helm.toLowerCase() === helm.toLowerCase();
      return classMatch && sailMatch && helmMatch;
    });
    if (!match) return;
    row.matchedCompetitorId = match.id;
    row.accepted = true;
    const current = this.result();
    if (current) this.result.set({ ...current, scannedResults: [...current.scannedResults] });
  }

  onAcceptanceChanged({ rowIndex, accepted }: AcceptanceChangedEvent): void {
    this.result.update(current =>
      current
        ? {
            ...current,
            scannedResults: current.scannedResults.map(row =>
              row.rowIndex === rowIndex ? { ...row, accepted } : row,
            ),
          }
        : null,
    );
  }

  async openKnownBoatEntry(row: ScannedResultRow): Promise<void> {
    const raceId = this.form.value.raceId;
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!raceId || !boatClass || !sailNumber) return;

    const matches = this.findBoatMatches(row);
    if (matches.length === 0) {
      await this.openUnmatchedRowEntry(row);
      return;
    }

    const dialogRef = this.dialog.open(KnownBoatEntryDialog, {
      width: '520px',
      data: { raceId, boatClass, sailNumber, boats: matches },
    });

    const result = (await firstValueFrom(dialogRef.afterClosed())) as KnownBoatEntryDialogResult | undefined;
    if (!result?.created) return;
    const selectedBoat = matches.find(b => b.id === result.selectedBoatId);
    this.refreshScanRowMatch(row, boatClass, sailNumber, selectedBoat?.helm);
  }

  async openUnmatchedRowEntry(row: ScannedResultRow): Promise<void> {
    const raceId = this.form.value.raceId;
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!raceId || !boatClass || !sailNumber) return;

    const dialogRef = this.dialog.open(UnmatchedRowEntryDialog, {
      width: '420px',
      data: { raceId, boatClass, sailNumber },
    });

    const result = (await firstValueFrom(dialogRef.afterClosed())) as UnmatchedRowEntryDialogResult | undefined;
    if (!result?.created) return;
    this.refreshScanRowMatch(row, boatClass, sailNumber, result.helm);
  }

  async saveResults(): Promise<void> {
    const raceId = this.form.value.raceId;
    if (!raceId) return;
    const race = this.selectedRace();
    if (!race) {
      console.log('ScoringSheetScanner.saveResults: selectedRace() returned null', {
        raceIdFromForm: raceId,
        availableRaceIds: this.raceCalendarStore.allRaces().map(r => r.id),
      });
      this.error.set('Select a race first.');
      return;
    }
    const preSaveCompetitorsById = new Map(
      this.competitorStore.selectedCompetitors().map(c => [c.id, c] as const),
    );
    if (!(await this.ensureStartTimesConfigured())) return;
    const acceptedMatchedItems = this.matchedRows().filter(vm => vm.row.accepted && !!vm.row.matchedCompetitorId);
    if (acceptedMatchedItems.length === 0) {
      this.error.set('No accepted matched rows to save.');
      return;
    }
    this.currentRacesStore.addRaceId(raceId);
    this.error.set(null);
    this.loading.set(true);
    try {
      const acceptedMatchedIds = acceptedMatchedItems.map(vm => vm.row.matchedCompetitorId!).filter(Boolean);
      const missingMatchedIds = acceptedMatchedItems
        .filter(vm => !vm.competitor)
        .map(vm => vm.row.matchedCompetitorId!);
      if (missingMatchedIds.length > 0) {
        const diagnostic = {
          raceIdFromForm: raceId,
          acceptedMatchedIds,
          missingMatchedIds,
          availableCompetitorIds: Array.from(preSaveCompetitorsById.keys()),
        };
        console.log('ScoringSheetScanner.saveResults: competitor invariant failed', diagnostic);
        this.error.set(
          `Could not save accepted results: ${missingMatchedIds.length} matched competitors were not available in memory.`,
        );
        return;
      }

      for (const vm of acceptedMatchedItems) {
        const competitor = vm.competitor!;
        const finishTime = vm.row.time?.value ? this.parseScannedTime(vm.row.time.value) : null;
        await this.manualResultsService.recordResult(competitor, race, {
          finishTime,
          laps: vm.row.laps?.value || 1,
          resultCode: this.normalizeScannedResultCode(vm.row.status),
        });
      }
      await this.scannerOrchestration.clearScanResponse(this.clubTenant.clubId, raceId);
      this.storedScanOffer.set(null);
      await this.router.navigate(['/results-input/manual'], { queryParams: { raceId } });
    } finally {
      this.loading.set(false);
    }
  }

  async scan(): Promise<void> {
    if (!isCaptureReady(this.captureImage())) return;
    if (this.form.invalid) return this.error.set('Select a race and complete the context form.');

    this.error.set(null);
    this.result.set(null);
    const v = this.form.getRawValue();
    const scannerContext: ScannerContext = {
      targetRaces: [] as string[],
      lapFormat: v.lapFormat as 'numbers' | 'ticks',
      defaultHour: v.defaultHour,
      defaultLaps: v.defaultLaps,
      hasHours: v.timeFormat !== 'stopwatch_ms_elapsed',
      listOrder: v.listOrder as 'chronological' | 'firstLap' | 'unsorted',
      classAliases: {} as Record<string, string>,
      roster: [] as { id: string; class: string; sailNumber: string; name?: string; }[],
      lapsPresentOnSheet: v.lapsPresentOnSheet,
      timeFormat: v.timeFormat,
      scanStrategy: v.scanStrategy,
    };

    await new Promise<void>((resolve) => {
      const sub = this.scannerOrchestration.runScan({
        raceId: this.form.value.raceId!,
        clubId: this.clubTenant.clubId,
        scannerContext,
        ...toScanRunFields(this.captureImage()),
      }).subscribe(state => {
        if (state.status === 'running') {
          this.loading.set(true);
          this.scanStage.set(state.stageMessage ?? this.scannerOrchestration.defaultStageMessage());
          return;
        }
        this.loading.set(false);
        this.scanStage.set(null);
        if (state.status === 'success' && state.result) {
          this.result.set(state.result);
        } else if (state.status === 'error') {
          this.error.set(state.error ?? 'Scan failed.');
        }
      });
      sub.add(() => resolve());
    });
  }
}

/** Boat-class matching: whitespace/case insensitive, treats Laser as ILCA. */
function normaliseBoatClassForMatch(className: string | undefined | null): string {
  return normaliseString(className).replace(/laser/g, 'ilca');
}

export function boatClassesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  return normaliseBoatClassForMatch(a) === normaliseBoatClassForMatch(b);
}
