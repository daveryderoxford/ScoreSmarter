import { afterNextRender, Component, computed, effect, inject, Injector, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { CaptureStep, CaptureStepViewModel } from '../capture/capture-step/capture-step';
import { Toolbar } from 'app/shared/components/toolbar';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { SheetCaptureStore } from './capture-image/sheet-capture.store';
import { ScanExecutionService } from './run-scan/scan-execution.service';
import { ScanRunStore } from './run-scan/scan-run.store';
import { ReviewStep } from './review-save/review-step';
import { ScanPersistenceService } from './shared/scan-persistence.service';
import { RaceSelectionStore } from './select-race/race-selection.store';
import { RaceStep } from './select-race/race-step';
import { SetupStep } from './run-scan/setup-step';

const CAPTURE_STEP_INDEX = 1;
const REVIEW_STEP_INDEX = 3;

@Component({
  selector: 'app-scoring-sheet-scanner',
  imports: [MatStepperModule, MatButtonModule, Toolbar, RaceStep, CaptureStep, SetupStep, ReviewStep],
  templateUrl: './scoring-sheet-scanner.html',
  styleUrl: './scoring-sheet-scanner.scss',
  providers: [
    RaceSelectionStore,
    SheetCaptureStore,
    ScanRunStore,
    ScanPersistenceService,
    ScanExecutionService,
  ],
})
export class ScoringSheetScanner {
  private readonly injector = inject(Injector);
  private readonly breakpoints = inject(AppBreakpoints);
  protected readonly raceSelection = inject(RaceSelectionStore);
  protected readonly sheetCapture = inject(SheetCaptureStore);
  protected readonly scanRun = inject(ScanRunStore);

  readonly isMobile = this.breakpoints.isMobile;
  protected readonly capturePersisting = signal(false);
  private readonly stepper = viewChild.required<MatStepper>('stepper');

  protected readonly captureVm = computed<CaptureStepViewModel>(() => {
    const preview = this.sheetCapture.preview();
    return {
      mode: this.sheetCapture.mode(),
      isMobile: this.isMobile(),
      previewSrc: preview.src,
      storedImageError: preview.error,
      previewLoading: preview.loading,
    };
  });

  constructor() {
    effect(() => {
      this.raceSelection.selectedRaceId();
      untracked(() => {
        this.sheetCapture.resetToRaceStoredSheet();
        this.scanRun.reset();
      });
    });

    effect(() => {
      const acquired = this.sheetCapture.justAcquired();
      if (!acquired?.autoAdvance) return;
      untracked(() => {
        const stepper = this.stepper();
        if (stepper.selectedIndex !== CAPTURE_STEP_INDEX) return;
        if (!this.sheetCapture.hasImage()) return;
        stepper.next();
      });
    });
  }

  async onStepChange(event: { selectedIndex: number }): Promise<void> {
    if (event.selectedIndex !== REVIEW_STEP_INDEX) return;
    if (!this.sheetCapture.hasImage()) return;
    if (this.scanRun.running()) return;
    if (this.scanRun.scanResult()) return;
    await this.scanRun.runScan();
  }

  async onCaptureStepNext(): Promise<void> {
    if (!this.sheetCapture.hasImage()) return;
    this.capturePersisting.set(true);
    try {
      await this.sheetCapture.persistIfNeeded();
      this.stepper().next();
    } finally {
      this.capturePersisting.set(false);
    }
  }

  useSavedScan(): void {
    this.scanRun.useStoredScan();
    this.jumpTo(REVIEW_STEP_INDEX);
  }

  async discardSavedScan(): Promise<void> {
    await this.scanRun.discardStoredScan();
    this.sheetCapture.resetToRaceStoredSheet();
    this.jumpTo(CAPTURE_STEP_INDEX);
  }

  goToPreviousStep(): void {
    this.stepper().previous();
  }

  onCaptureNewInstead(): void {
    this.sheetCapture.startNewCapture();
    this.scanRun.reset();
  }

  onCaptureFile(file: File): void {
    this.scanRun.reset();
    void this.sheetCapture.setFromFile(file);
  }

  onOpenCameraCapture(): void {
    this.scanRun.reset();
    void this.sheetCapture.openCameraCapture();
  }

  onStartPhoneCapture(): void {
    this.scanRun.reset();
    void this.sheetCapture.startPhoneCapture();
  }

  private jumpTo(index: number): void {
    afterNextRender(() => (this.stepper().selectedIndex = index), { injector: this.injector });
  }
}
