import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectChange } from '@angular/material/select';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router } from '@angular/router';
import { BoatsStore } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { RacePickerDialog } from 'app/race-calender/presentation/race-picker-dialog/race-picker-dialog';
import { RESULT_CODES, ResultCode } from 'app/scoring/model/result-code-scoring';
import { format, isToday } from 'date-fns';
import { firstValueFrom } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { Toolbar } from "../../../shared/components/toolbar";
import { CurrentRaces } from '../../services/current-races-store';
import { ManualResultsService } from '../../services/manual-results.service';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { SeriesEntryStore } from '../../services/series-entry-store';
import { RaceStartTimeDialog, RaceStartTimeResult } from '../handicap/race-start-time-dialog';
import { CameraCaptureDialog } from './camera-capture-dialog';
import { CaptureStep } from './capture-step';
import { KnownBoatEntryDialog, KnownBoatEntryDialogResult } from './known-boat-entry-dialog';
import { MatchedRowVm, ReviewStep, UnmatchedRowVm } from './review-step';
import { ScanResponse, ScannedResultRow, ScannerContext } from './scan-model';
import { ScannerOrchestrationService } from './scanner-orchestration.service';
import { RaceStep } from './race-step';
import { SetupStep } from './setup-step';
import type { ScannerTimeFormat } from '@shared/scanner-context';

@Component({
  selector: 'app-scoring-sheet-scanner',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatStepperModule,
    RaceStep,
    SetupStep,
    CaptureStep,
    ReviewStep,
    MatButtonModule,
    Toolbar
  ],
  templateUrl: './scoring-sheet-scanner.html',
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
  private readonly entryStore = inject(SeriesEntryStore);
  private readonly boatsStore = inject(BoatsStore);
  private readonly clubTenant = inject(ClubTenant);
  private readonly clubStore = inject(ClubStore);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly scannerOrchestration = inject(ScannerOrchestrationService);
  private readonly manualResultsService = inject(ManualResultsService);

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
  });
  captureForm = this.fb.nonNullable.group({
    hasImage: [false, Validators.requiredTrue],
  });

  private readonly selectedRaceId = toSignal(
    this.form.controls.raceId.valueChanges.pipe(startWith(this.form.controls.raceId.value)),
    { initialValue: this.form.controls.raceId.value }
  );
  readonly selectedRace = computed(() => this.raceCalendarStore.allRaces().find((r: Race) => r.id === this.selectedRaceId()));
  readonly hasExistingImage = computed(() => !!this.selectedRace()?.resultsSheetImage);
  readonly hasConfiguredStartTimes = computed(() => {
    const race = this.selectedRace();
    return !!race && this.hasConfiguredStarts(race);
  });
  readonly todaysRaceOptions = computed(() =>
    this.raceCalendarStore.allRaces().filter((r: Race) => isToday(r.scheduledStart)).map((r: Race) => ({
      id: r.id,
      label: `${r.seriesName} — Race ${r.index}`,
    })),
  );
  pickedRaceId = signal<string | null>(null);
  readonly pickedRaceOption = computed(() => {
    const pId = this.pickedRaceId();
    if (!pId) return null;
    const r = this.raceCalendarStore.allRaces().find((x: Race) => x.id === pId);
    if (!r) return null;
    return { id: r.id, label: `${r.seriesName} — Race ${r.index} (${format(r.scheduledStart, 'yyyy-MM-dd')})` };
  });
  readonly selectedRaceSummary = computed(() => {
    const race = this.selectedRace();
    if (race) {
      return {
        title: `${race.seriesName} - Race ${race.index}`,
        meta: [
          this.formatRaceDateTime(race.scheduledStart),
          `Status: ${race.status}`,
          `Type: ${race.type}`,
        ],
      };
    }
    const raceId = this.selectedRaceId();
    if (!raceId) return null;
    const picked = this.pickedRaceOption();
    if (picked?.id === raceId) {
      return {
        title: picked.label,
        meta: [`Race ID: ${raceId}`],
      };
    }
    return {
      title: `Selected race (${raceId})`,
      meta: [],
    };
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

  imageBase64 = signal<string | null>(null);
  imageMimeType = signal<string | null>(null);
  imagePreview = signal<string | null>(null);
  loading = signal(false);
  result = signal<ScanResponse | null>(null);
  error = signal<string | null>(null);
  scanStage = signal<string | null>(null);

  readonly matchedResults = computed(() => this.result()?.scannedResults.filter(r => !!r.matchedCompetitorId) ?? []);
  
  private readonly matchedCompetitorById = computed(() =>
    new Map(this.competitorStore.selectedCompetitors().map(c => [c.id, c] as const)),
  );

  private readonly helmBySeriesEntryId = computed(() =>
    new Map(this.entryStore.selectedEntries().map(e => [e.id, e.helm] as const)),
  );

  readonly matchedRows = computed<MatchedRowVm[]>(() =>
    this.matchedResults().map(row => {
      const competitor = row.matchedCompetitorId ? this.matchedCompetitorById().get(row.matchedCompetitorId) : undefined;
      const helm = competitor?.seriesEntryId ? this.helmBySeriesEntryId().get(competitor.seriesEntryId) : undefined;
      return { row, helm, competitor };
    }),
  );

  readonly unmatchedResults = computed(() => this.result()?.scannedResults.filter(r => !r.matchedCompetitorId) ?? []);
  
  readonly unmatchedRows = computed<UnmatchedRowVm[]>(() =>
    this.unmatchedResults().map(row => {
      const matches = this.findBoatMatches(row);
      const helms = Array.from(new Set(matches.map(m => m.helm).filter((h): h is string => !!h && h.trim().length > 0)));
      return { row, hasKnownBoat: matches.length > 0, possibleHelms: helms };
    }),
  );

  readonly displayedColumns = ['accept', 'sailNumber', 'boatClass', 'helm', 'time', 'status', 'laps', 'overall'];
  readonly unmatchedColumns = ['sailNumber', 'boatClass', 'time', 'status', 'laps', 'enter'];
  readonly hasCapturedImage = computed(() => !!this.imageBase64() && !!this.imageMimeType());
  readonly isMockScanMode = computed(() => this.scannerOrchestration.isMockMode(this.route.snapshot.queryParamMap.get('mockScan')));

  private findBoatMatches(row: ScannedResultRow) {
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = Number(row.sailNumber?.value);
    if (!boatClass || !Number.isFinite(sailNumber)) return [];
    return this.boatsStore.boats().filter(
      b => b.boatClass.toLowerCase() === boatClass.toLowerCase() && Number(b.sailNumber) === sailNumber,
    );
  }

  constructor() {
    if (this.isMockScanMode()) {
      // Allow capture step completion without image while testing review flow.
      this.captureForm.controls.hasImage.setValue(true);
    }
  }

  private formatRaceDateTime(value: Date): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Scheduled time unavailable';
    return format(date, 'EEE d MMM, HH:mm');
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

  async onRaceSelect(event: MatSelectChange): Promise<void> {
    if (event.value !== '__MORE__') return;
    const dialogRef = this.dialog.open(RacePickerDialog, {
      width: '500px',
      data: {
        title: 'Select Race',
        maxSelections: 1,
        requireSelection: true,
        mode: 'scanner',
        defaultPeriod: 'past',
        availablePeriods: ['past'],
        hideIncompleteDefault: true,
      },
    });
    dialogRef.afterClosed().subscribe(selection => {
      const id = selection?.[0];
      if (!id) {
        this.form.controls.raceId.setValue('');
        this.pickedRaceId.set(null);
        return;
      }
      this.form.patchValue({ raceId: id });
      this.pickedRaceId.set(id);
      this.currentRacesStore.addRaceId(id);
    });
  }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return this.clearImage();
    this.result.set(null);
    this.error.set(null);
    this.imageMimeType.set(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const readResult = reader.result as string;
      this.imagePreview.set(readResult);
      this.imageBase64.set(readResult.split(',')[1]);
      this.captureForm.controls.hasImage.setValue(true);
    };
    reader.readAsDataURL(file);
  }

  clearImage(): void {
    this.imageBase64.set(null);
    this.imageMimeType.set(null);
    this.imagePreview.set(null);
    this.captureForm.controls.hasImage.setValue(this.isMockScanMode());
    this.result.set(null);
    this.error.set(null);
  }

  openCameraDialog(): void {
    const dialogRef = this.dialog.open(CameraCaptureDialog, { width: '800px', maxWidth: '95vw', disableClose: true });
    dialogRef.afterClosed().subscribe(result => {
      if (!result) return;
      this.imageBase64.set(result.base64);
      this.imagePreview.set(result.preview);
      this.imageMimeType.set('image/jpeg');
      this.captureForm.controls.hasImage.setValue(true);
    });
  }

  useExistingImage(): void {
    const img = this.selectedRace()?.resultsSheetImage;
    if (!img) return;
    this.imagePreview.set(img);
    if (img.startsWith('data:')) {
      this.imageBase64.set(img.split(',')[1]);
      this.imageMimeType.set(img.split(';')[0].split(':')[1]);
    } else {
      this.imageBase64.set(img);
      this.imageMimeType.set('image/jpeg');
    }
    this.captureForm.controls.hasImage.setValue(true);
    this.result.set(null);
    this.error.set(null);
  }

  async onStepChange(event: { selectedIndex: number; }): Promise<void> {
    if (event.selectedIndex !== 3) return;
    if (!this.isMockScanMode() && (!this.imageBase64() || !this.imageMimeType())) return;
    if (this.loading()) return;
    if (this.result()) return;
    await this.scan();
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

  private refreshScanRowMatch(row: ScannedResultRow, boatClass: string, sailNumber: number, helm?: string): void {
    const raceId = this.form.value.raceId;
    if (!raceId) return;
    const comps = this.competitorStore.selectedCompetitors().filter(c => c.raceId === raceId);
    const entries = this.entryStore.selectedEntries();
    const match = comps.find(c => {
      const e = entries.find(se => se.id === c.seriesEntryId);
      if (!e) return false;
      const classMatch = e.boatClass?.toLowerCase() === boatClass.toLowerCase();
      const sailMatch = e.sailNumber === sailNumber;
      const helmMatch = !helm || e.helm?.toLowerCase() === helm.toLowerCase();
      return classMatch && sailMatch && helmMatch;
    });
    if (!match) return;
    row.matchedCompetitorId = match.id;
    row.accepted = true;
    const current = this.result();
    if (current) this.result.set({ ...current, scannedResults: [...current.scannedResults] });
  }

  async openKnownBoatEntry(row: ScannedResultRow): Promise<void> {
    const raceId = this.form.value.raceId;
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = Number(row.sailNumber?.value);
    if (!raceId || !boatClass || !Number.isFinite(sailNumber)) return;

    const matches = this.boatsStore.boats().filter(
      b => b.boatClass.toLowerCase() === boatClass.toLowerCase() && Number(b.sailNumber) === sailNumber,
    );
    if (matches.length === 0) {
      await this.openManualEntryForRow(row);
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

  async openManualEntryForRow(row: ScannedResultRow): Promise<void> {
    const raceId = this.form.value.raceId;
    if (!raceId) return;
    await this.router.navigate(['/entry/enter'], {
      queryParams: { raceId, returnTo: 'results-input', boatClass: row.boatClass?.value ?? '', sailNumber: row.sailNumber?.value ?? '' },
    });
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
      await this.router.navigate(['/results-input/manual'], { queryParams: { raceId } });
    } finally {
      this.loading.set(false);
    }
  }

  async scan(): Promise<void> {
    if (!this.isMockScanMode() && (!this.imageBase64() || !this.imageMimeType())) return;
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
    };

    await new Promise<void>((resolve) => {
      const sub = this.scannerOrchestration.runScan({
        raceId: this.form.value.raceId!,
        clubId: this.clubTenant.clubId,
        scannerContext,
        imageBase64: this.imageBase64(),
        imageMimeType: this.imageMimeType(),
        mockMode: this.isMockScanMode(),
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
