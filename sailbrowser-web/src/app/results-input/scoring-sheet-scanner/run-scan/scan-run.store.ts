import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import type { ScanStrategy, ScannerTimeFormat } from '@shared/scanner-context';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { from, of } from 'rxjs';
import { RaceSelectionStore } from '../select-race/race-selection.store';
import { SheetCaptureStore } from '../capture-image/sheet-capture.store';
import { ScanPersistenceService } from '../shared/scan-persistence.service';
import { ScanExecutionService } from './scan-execution.service';
import { ScannerContext, ScanResponse } from '../model/scan-model';

/**
 * Area 3 — owns the scanner-context form, the stored-scan read (a resource), and
 * the live scan run that produces an editable working result. Stored scan and
 * live run are modeled differently on purpose: stored scan is a pure async read
 * keyed on the selected race; the live run streams progress and writes a
 * user-editable copy (acceptance toggles, manual-entry re-matching).
 */
@Injectable()
export class ScanRunStore {
  private readonly fb = inject(FormBuilder);
  private readonly clubTenant = inject(ClubTenant);
  private readonly raceSelection = inject(RaceSelectionStore);
  private readonly sheetCapture = inject(SheetCaptureStore);
  private readonly scanExecution = inject(ScanExecutionService);
  private readonly scanPersistence = inject(ScanPersistenceService);

  readonly contextForm = this.fb.nonNullable.group({
    listOrder: ['chronological', Validators.required],
    timeFormat: this.fb.nonNullable.control<ScannerTimeFormat>('clock_hms', Validators.required),
    lapsPresentOnSheet: this.fb.nonNullable.control(true, Validators.required),
    lapFormat: ['numbers', Validators.required],
    defaultHour: [10, [Validators.min(0), Validators.max(23)]],
    defaultLaps: [1, [Validators.min(1), Validators.max(100)]],
    scanStrategy: this.fb.nonNullable.control<ScanStrategy>('FullAIScan', Validators.required),
  });

  // --- Stored scan (read-only) — resource keyed on the selected race ---
  readonly storedScan = rxResource<ScanResponse | null, string | undefined>({
    params: () => this.raceSelection.selectedRaceId() ?? undefined,
    stream: ({ params }) =>
      params ? from(this.scanPersistence.getScanResponse(params)) : of(null),
    defaultValue: null,
  });
  readonly hasStoredScan = computed(() => !!this.storedScan.value());

  // --- Live scan run + editable working copy ---
  private readonly _scanResult = signal<ScanResponse | null>(null);
  readonly scanResult = this._scanResult.asReadonly();
  private readonly _running = signal(false);
  readonly running = this._running.asReadonly();
  private readonly _scanStage = signal<string | null>(null);
  readonly scanStage = this._scanStage.asReadonly();
  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  /** Seed the working copy from the stored scan (after applying auto-accept). */
  useStoredScan(): void {
    const stored = this.storedScan.value();
    if (!stored) return;
    this._scanResult.set(this.scanPersistence.prepareScanResponseForReview(stored));
    this._error.set(null);
  }

  async discardStoredScan(): Promise<void> {
    const raceId = this.raceSelection.selectedRaceId();
    if (!raceId) return;
    await this.scanPersistence.clearScanResponse(raceId);
    this._scanResult.set(null);
    this._error.set(null);
    this.storedScan.reload();
  }

  async runScan(): Promise<void> {
    if (!this.sheetCapture.hasImage()) return;
    if (this.contextForm.invalid) {
      this._error.set('Select a race and complete the context form.');
      return;
    }
    const raceId = this.raceSelection.selectedRaceId();
    if (!raceId) return;

    this._error.set(null);
    this._scanResult.set(null);
    const scannerContext = this.buildScannerContext();

    await new Promise<void>((resolve) => {
      const sub = this.scanExecution
        .runScan({
          raceId,
          clubId: this.clubTenant.clubId,
          scannerContext,
          ...this.sheetCapture.toScanRunFields(),
        })
        .subscribe((state) => {
          if (state.status === 'running') {
            this._running.set(true);
            this._scanStage.set(state.stageMessage ?? this.scanExecution.defaultStageMessage());
            return;
          }
          this._running.set(false);
          this._scanStage.set(null);
          if (state.status === 'success' && state.result) {
            this._scanResult.set(state.result);
          } else if (state.status === 'error') {
            this._error.set(state.error ?? 'Scan failed.');
          }
        });
      sub.add(() => resolve());
    });
  }

  /** Toggle a row's acceptance on the working copy. */
  updateAcceptance(rowIndex: number, accepted: boolean): void {
    this._scanResult.update((current) =>
      current
        ? {
            ...current,
            scannedResults: current.scannedResults.map((row) =>
              row.rowIndex === rowIndex ? { ...row, accepted } : row,
            ),
          }
        : null,
    );
  }

  /** Attach a competitor match to a row (after manual entry) and accept it. */
  applyRowMatch(rowIndex: number, competitorId: string): void {
    this._scanResult.update((current) =>
      current
        ? {
            ...current,
            scannedResults: current.scannedResults.map((row) =>
              row.rowIndex === rowIndex
                ? { ...row, matchedCompetitorId: competitorId, accepted: true }
                : row,
            ),
          }
        : null,
    );
  }

  reset(): void {
    this._scanResult.set(null);
    this._running.set(false);
    this._scanStage.set(null);
    this._error.set(null);
  }

  private buildScannerContext(): ScannerContext {
    const v = this.contextForm.getRawValue();
    return {
      targetRaces: [] as string[],
      lapFormat: v.lapFormat as 'numbers' | 'ticks',
      defaultHour: v.defaultHour,
      defaultLaps: v.defaultLaps,
      hasHours: v.timeFormat !== 'stopwatch_ms_elapsed',
      listOrder: v.listOrder as 'chronological' | 'firstLap' | 'unsorted',
      classAliases: {} as Record<string, string>,
      roster: [] as { id: string; class: string; sailNumber: string; name?: string }[],
      lapsPresentOnSheet: v.lapsPresentOnSheet,
      timeFormat: v.timeFormat,
      scanStrategy: v.scanStrategy,
    };
  }
}
