import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { BoatsStore } from 'app/boats';
import { normalizeSailNumber, sailNumbersEqual } from 'app/boats/model/sail-number';
import { ClubStore } from 'app/club-tenant';
import { firstValueFrom } from 'rxjs';
import { FIRESTORE_BULK_WRITE_TIMEOUT_MS, withTimeout } from 'app/shared/utils/with-timeout';
import { ManualResultsService } from '../../services/manual-results.service';
import { RaceCompetitorReader } from '../../services/race-competitor-reader';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { KnownBoatEntryDialog, KnownBoatEntryDialogResult } from './known-boat-entry-dialog';
import {
  LinkScanRowDialog,
  type LinkScanRowDialogResult,
} from './link-scan-row-dialog';
import {
  UnmatchedRowEntryDialog,
  type UnmatchedRowEntryDialogResult,
} from './unmatched-row-entry-dialog';
import { ScanSelectedRace } from '../select-race/race-selection.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { ScanPersistenceService } from '../shared/scan-persistence.service';
import { boatClassesMatch, ScanRowMatchingService } from './scan-row-matching.service';
import {
  AcceptanceChangedEvent,
  MatchedRowVm,
  UnmatchedRowVm,
} from './review-step';
import { ScannedResultRow } from '../model/scan-model';

const REMATCH_ATTEMPTS = 8;
const REMATCH_DELAY_MS = 75;

/**
 * Area 4 — owns the matched/unmatched view models, manual-entry dialogs, and the
 * save pipeline. Reads the editable working copy from {@link ScanRunStore} and
 * writes row matches back through it.
 */
@Injectable()
export class ScanReviewStore {
  private readonly scanRun = inject(ScanRunStore);
  private readonly raceSelection = inject(ScanSelectedRace);
  private readonly rowMatching = inject(ScanRowMatchingService);
  private readonly competitorReader = inject(RaceCompetitorReader);
  private readonly competitorStore = inject(RaceCompetitorStore);
  private readonly manualResults = inject(ManualResultsService);
  private readonly scanPersistence = inject(ScanPersistenceService);
  private readonly boatsStore = inject(BoatsStore);
  private readonly clubStore = inject(ClubStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly displayedColumns: readonly string[] = [
    'accept', 'rowIndex', 'sailNumber', 'boatClass', 'helm', 'time', 'status', 'laps', 'overall',
  ];
  readonly unmatchedColumns: readonly string[] = [
    'rowIndex', 'sailNumber', 'boatClass', 'time', 'status', 'laps', 'helms', 'enter',
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

  /** Race competitors not already linked to a scan row — candidates for Link. */
  readonly linkableCompetitors = computed(() => {
    const raceId = this.raceSelection.selectedRaceId();
    if (!raceId) return [];
    return this.rowMatching.unmatchedRaceCompetitors(
      this.competitorReader.resolvedForRace(raceId),
      this.scanRun.scanResult()?.scannedResults ?? [],
    );
  });

  readonly canLink = computed(() => this.linkableCompetitors().length > 0);

  readonly acceptedMatchedCount = computed(
    () => this.matchedRows().filter(vm => !!vm.row.accepted).length,
  );

  setAcceptance(e: AcceptanceChangedEvent): void {
    this.scanRun.updateAcceptance(e.rowIndex, e.accepted);
  }

  promoteAlternative(
    rowIndex: number,
    field: 'sailNumber' | 'boatClass' | 'competitorName' | 'time' | 'laps',
    chosen: string | number,
  ): void {
    this.scanRun.promoteAlternative(rowIndex, field, chosen);
  }

  async enterKnownBoat(row: ScannedResultRow): Promise<void> {
    const raceId = this.raceSelection.selectedRaceId();
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!raceId || !boatClass || !sailNumber) {
      this.snackbar.open('Class and sail number are required to create an entry.', 'Dismiss', {
        duration: 4000,
      });
      return;
    }

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
    await this.refreshScanRowMatch(row, boatClass, sailNumber, selectedBoat?.helm);
  }

  async enterUnmatched(row: ScannedResultRow): Promise<void> {
    const raceId = this.raceSelection.selectedRaceId();
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!raceId || !boatClass || !sailNumber) {
      this.snackbar.open('Class and sail number are required to create an entry.', 'Dismiss', {
        duration: 4000,
      });
      return;
    }

    const dialogRef = this.dialog.open(UnmatchedRowEntryDialog, {
      width: '420px',
      data: { raceId, boatClass, sailNumber },
    });
    const result = (await firstValueFrom(dialogRef.afterClosed())) as
      | UnmatchedRowEntryDialogResult
      | undefined;
    if (!result?.created) return;
    await this.refreshScanRowMatch(row, boatClass, sailNumber, result.helm);
  }

  async linkScanRow(row: ScannedResultRow): Promise<void> {
    const competitors = this.linkableCompetitors();
    if (competitors.length === 0) {
      this.snackbar.open('No unlinked race entries available to link.', 'Dismiss', {
        duration: 4000,
      });
      return;
    }

    const dialogRef = this.dialog.open(LinkScanRowDialog, {
      width: '480px',
      data: {
        rowIndex: row.rowIndex,
        competitors,
        scannedClass: row.boatClass?.value,
        scannedSail: row.sailNumber?.value,
      },
    });
    const result = (await firstValueFrom(dialogRef.afterClosed())) as
      | LinkScanRowDialogResult
      | undefined;
    if (!result?.competitorId) return;
    this.scanRun.applyRowMatch(row.rowIndex, result.competitorId);
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
        .filter(vm => {
          const competitorId = vm.row.matchedCompetitorId;
          return !competitorId || !this.resolvedByCompetitorId().has(competitorId);
        })
        .map(vm => vm.row.matchedCompetitorId!);
      if (missingMatchedIds.length > 0) {
        const diagnostic = {
          raceIdFromForm: raceId,
          acceptedMatchedIds,
          missingMatchedIds,
          availableCompetitorIds: Array.from(preSaveCompetitorsById.keys()),
        };
        console.error('ScanReviewStore.save: competitor invariant failed', diagnostic);
        this._error.set(
          `Could not save accepted results: ${missingMatchedIds.length} matched competitors were not available in memory.`,
        );
        return;
      }

      const timeFormat = this.scanRun.contextForm.controls.timeFormat.value;
      const defaultHour = this.scanRun.defaultHourForParsing();
      await withTimeout(
        (async () => {
          for (const vm of acceptedMatchedItems) {
            const competitor = this.resolvedByCompetitorId().get(vm.row.matchedCompetitorId!);
            if (!competitor) continue;
            const finishTime = vm.row.time?.value
              ? this.rowMatching.parseScannedTime(vm.row.time.value, race, { timeFormat, defaultHour })
              : null;
            await this.manualResults.recordResult(competitor, race, {
              finishTime,
              laps: vm.row.laps?.value || 1,
              resultCode: this.rowMatching.normalizeResultCode(vm.row.status),
              scoringSheetRow: vm.row.rowIndex,
            });
          }
          await this.scanPersistence.clearScanResponse(raceId);
        })(),
        FIRESTORE_BULK_WRITE_TIMEOUT_MS,
        'Saving scan results',
      );
      await this.router.navigate(['/results-input/manual'], { queryParams: { raceId } });
    } catch (err: unknown) {
      console.error('ScanReviewStore.save: save failed', err);
      this._error.set(this.saveErrorMessage(err));
    } finally {
      this._saving.set(false);
    }
  }

  private saveErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : 'Could not save scan results.';
  }

  private async refreshScanRowMatch(
    row: ScannedResultRow,
    boatClass: string,
    sailNumber: string,
    helm?: string,
  ): Promise<void> {
    const raceId = this.raceSelection.selectedRaceId();
    if (!raceId) return;

    for (let attempt = 0; attempt < REMATCH_ATTEMPTS; attempt++) {
      const match = this.competitorReader.resolvedForRace(raceId).find(r => {
        const classMatch = boatClassesMatch(r.boatClass, boatClass);
        const sailMatch = sailNumbersEqual(r.sailNumber, sailNumber);
        const helmMatch = !helm || r.helm.toLowerCase() === helm.toLowerCase();
        return classMatch && sailMatch && helmMatch;
      });
      if (match) {
        this.scanRun.applyRowMatch(row.rowIndex, match.id);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, REMATCH_DELAY_MS));
    }

    this.snackbar.open(
      'Entry was created, but the scan row could not be linked automatically. Use Link to attach it.',
      'Dismiss',
      { duration: 6000 },
    );
  }
}
