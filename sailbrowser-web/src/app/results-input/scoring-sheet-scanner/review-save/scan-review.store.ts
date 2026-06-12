import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { BoatsStore } from 'app/boats';
import { normalizeSailNumber, sailNumbersEqual } from 'app/boats/model/sail-number';
import { ClubStore } from 'app/club-tenant';
import { firstValueFrom } from 'rxjs';
import { ManualResultsService } from '../../services/manual-results.service';
import { RaceCompetitorReader } from '../../services/race-competitor-reader';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { KnownBoatEntryDialog, KnownBoatEntryDialogResult } from './known-boat-entry-dialog';
import {
  UnmatchedRowEntryDialog,
  type UnmatchedRowEntryDialogResult,
} from './unmatched-row-entry-dialog';
import { RaceSelectionStore } from '../select-race/race-selection.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { ScanPersistenceService } from '../shared/scan-persistence.service';
import { boatClassesMatch, ScanRowMatchingService } from './scan-row-matching.service';
import {
  AcceptanceChangedEvent,
  MatchedRowVm,
  UnmatchedRowVm,
} from './review-step';
import { ScannedResultRow } from '../model/scan-model';

/**
 * Area 4 — owns the matched/unmatched view models, manual-entry dialogs, and the
 * save pipeline. Reads the editable working copy from {@link ScanRunStore} and
 * writes row matches back through it.
 */
@Injectable()
export class ScanReviewStore {
  private readonly scanRun = inject(ScanRunStore);
  private readonly raceSelection = inject(RaceSelectionStore);
  private readonly rowMatching = inject(ScanRowMatchingService);
  private readonly competitorReader = inject(RaceCompetitorReader);
  private readonly competitorStore = inject(RaceCompetitorStore);
  private readonly manualResults = inject(ManualResultsService);
  private readonly scanPersistence = inject(ScanPersistenceService);
  private readonly boatsStore = inject(BoatsStore);
  private readonly clubStore = inject(ClubStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly displayedColumns: readonly string[] = [
    'accept', 'sailNumber', 'boatClass', 'helm', 'time', 'status', 'laps', 'overall',
  ];
  readonly unmatchedColumns: readonly string[] = [
    'sailNumber', 'boatClass', 'time', 'status', 'laps', 'helms', 'enter',
  ];

  private readonly _saving = signal(false);
  readonly saving = this._saving.asReadonly();
  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  private readonly resolvedByCompetitorId = computed(
    () => new Map(this.competitorReader.selectedResolvedCompetitors().map(r => [r.id, r] as const)),
  );

  readonly matchedRows = computed<MatchedRowVm[]>(() =>
    this.rowMatching.buildMatchedRows(
      this.scanRun.scanResult()?.scannedResults ?? [],
      this.resolvedByCompetitorId(),
    ),
  );

  readonly unmatchedRows = computed<UnmatchedRowVm[]>(() =>
    this.rowMatching.buildUnmatchedRows(this.scanRun.scanResult()?.scannedResults ?? [], {
      boats: this.boatsStore.boats(),
      classes: this.clubStore.club().classes,
    }),
  );

  readonly acceptedMatchedCount = computed(
    () => this.matchedRows().filter(vm => !!vm.row.accepted).length,
  );

  setAcceptance(e: AcceptanceChangedEvent): void {
    this.scanRun.updateAcceptance(e.rowIndex, e.accepted);
  }

  async enterKnownBoat(row: ScannedResultRow): Promise<void> {
    const raceId = this.raceSelection.selectedRaceId();
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!raceId || !boatClass || !sailNumber) return;

    const matches = this.rowMatching.findBoatMatches(row, this.boatsStore.boats());
    if (matches.length === 0) {
      await this.enterUnmatched(row);
      return;
    }

    const dialogRef = this.dialog.open(KnownBoatEntryDialog, {
      width: '520px',
      data: { raceId, boatClass, sailNumber, boats: matches },
    });
    const result = (await firstValueFrom(dialogRef.afterClosed())) as
      | KnownBoatEntryDialogResult
      | undefined;
    if (!result?.created) return;
    const selectedBoat = matches.find(b => b.id === result.selectedBoatId);
    this.refreshScanRowMatch(row, boatClass, sailNumber, selectedBoat?.helm);
  }

  async enterUnmatched(row: ScannedResultRow): Promise<void> {
    const raceId = this.raceSelection.selectedRaceId();
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!raceId || !boatClass || !sailNumber) return;

    const dialogRef = this.dialog.open(UnmatchedRowEntryDialog, {
      width: '420px',
      data: { raceId, boatClass, sailNumber },
    });
    const result = (await firstValueFrom(dialogRef.afterClosed())) as
      | UnmatchedRowEntryDialogResult
      | undefined;
    if (!result?.created) return;
    this.refreshScanRowMatch(row, boatClass, sailNumber, result.helm);
  }

  async save(): Promise<void> {
    const raceId = this.raceSelection.selectedRaceId();
    if (!raceId) return;
    const race = this.raceSelection.selectedRace();
    if (!race) {
      this._error.set('Select a race first.');
      return;
    }
    const preSaveCompetitorsById = new Map(
      this.competitorStore.selectedCompetitors().map(c => [c.id, c] as const),
    );
    if (!(await this.raceSelection.ensureStartTimesConfigured())) {
      this._error.set(this.raceSelection.error());
      return;
    }
    const acceptedMatchedItems = this.matchedRows().filter(
      vm => vm.row.accepted && !!vm.row.matchedCompetitorId,
    );
    if (acceptedMatchedItems.length === 0) {
      this._error.set('No accepted matched rows to save.');
      return;
    }
    this.raceSelection.select(raceId);
    this._error.set(null);
    this._saving.set(true);
    try {
      const acceptedMatchedIds = acceptedMatchedItems
        .map(vm => vm.row.matchedCompetitorId!)
        .filter(Boolean);
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
        console.log('ScanReviewStore.save: competitor invariant failed', diagnostic);
        this._error.set(
          `Could not save accepted results: ${missingMatchedIds.length} matched competitors were not available in memory.`,
        );
        return;
      }

      const timeFormat = this.scanRun.contextForm.controls.timeFormat.value;
      const defaultHour = this.scanRun.contextForm.controls.defaultHour.value;
      for (const vm of acceptedMatchedItems) {
        const competitor = vm.competitor!;
        const finishTime = vm.row.time?.value
          ? this.rowMatching.parseScannedTime(vm.row.time.value, race, { timeFormat, defaultHour })
          : null;
        await this.manualResults.recordResult(competitor, race, {
          finishTime,
          laps: vm.row.laps?.value || 1,
          resultCode: this.rowMatching.normalizeResultCode(vm.row.status),
        });
      }
      await this.scanPersistence.clearScanResponse(raceId);
      await this.router.navigate(['/results-input/manual'], { queryParams: { raceId } });
    } finally {
      this._saving.set(false);
    }
  }

  private refreshScanRowMatch(
    row: ScannedResultRow,
    boatClass: string,
    sailNumber: string,
    helm?: string,
  ): void {
    const raceId = this.raceSelection.selectedRaceId();
    if (!raceId) return;
    const match = this.competitorReader.resolvedForRace(raceId).find(r => {
      const classMatch = boatClassesMatch(r.boatClass, boatClass);
      const sailMatch = sailNumbersEqual(r.sailNumber, sailNumber);
      const helmMatch = !helm || r.helm.toLowerCase() === helm.toLowerCase();
      return classMatch && sailMatch && helmMatch;
    });
    if (!match) return;
    this.scanRun.applyRowMatch(row.rowIndex, match.id);
  }
}
