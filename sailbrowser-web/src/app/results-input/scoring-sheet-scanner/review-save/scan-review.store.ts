import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { BoatsStore } from 'app/boats';
import { Boat } from 'app/boats/model/boat';
import { EntryConflict, EntryDetails, EntryService } from 'app/entry/services/entry.service';
import { normalizeSailNumber } from 'app/boats/model/sail-number';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { firstValueFrom } from 'rxjs';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import type { EntryConflictSummary } from 'app/shared/dialogs/entry-conflict-dialog';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { FIRESTORE_BULK_WRITE_TIMEOUT_MS, withTimeout } from 'app/shared/utils/with-timeout';
import { ManualResultsService } from '../../services/manual-results.service';
import { RaceCompetitor } from '../../model/race-competitor';
import { SeriesEntry } from '../../model/series-entry';
import { RaceCompetitorReader } from '../../services/race-competitor-reader';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { SeriesEntryStore } from '../../services/series-entry-store';
import { describeIdentity } from '../../services/series-entry-identity';
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
import { ScanRowMatchingService } from './scan-row-matching.service';
import {
  applyAutomaticMatches,
  classifyScanRow,
  entryDetailsFromBoat,
  entryDetailsFromSeriesEntry,
  sameStagedIdentity,
  ScanRowIdentityPlan,
} from './scan-row-provision';
import {
  AcceptanceChangedEvent,
  MatchedRowVm,
  UnmatchedRowVm,
} from './review-step';
import { PendingScanEntry, ScannedResultRow } from '../model/scan-model';
import type { ScannedValueField } from '../run-scan/promote-scanned-alternative';

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
  private readonly seriesEntries = inject(SeriesEntryStore);
  private readonly entryService = inject(EntryService);
  private readonly clubStore = inject(ClubStore);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(DialogsService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly isLevelRatingScan = computed(() => this.raceSelection.isLevelRatingSelection());

  readonly displayedColumns = computed<readonly string[]>(() =>
    this.isLevelRatingScan()
      ? ['accept', 'rowIndex', 'sailNumber', 'boatClass', 'helm', 'race', 'position', 'status', 'overall']
      : ['accept', 'rowIndex', 'sailNumber', 'boatClass', 'helm', 'time', 'status', 'laps', 'overall'],
  );
  readonly unmatchedColumns = computed<readonly string[]>(() =>
    this.isLevelRatingScan()
      ? ['rowIndex', 'sailNumber', 'boatClass', 'race', 'position', 'status', 'helms', 'enter']
      : ['rowIndex', 'sailNumber', 'boatClass', 'time', 'status', 'laps', 'helms', 'enter'],
  );

  /**
   * Working-copy rows with automatic matches applied. The working copy holds
   * only the user's explicit choices; unique confident matches are derived here
   * so they follow edits such as choosing an alternative sail number.
   */
  readonly reviewRows = computed<ScannedResultRow[]>(() => {
    const rows = this.scanRun.scanResult()?.scannedResults ?? [];
    const races = this.raceCalendar.allRaces();
    return applyAutomaticMatches(rows, {
      raceFor: row => this.raceRefFor(row, races),
      competitors: this.competitorReader.selectedResolvedCompetitors(),
      seriesEntries: this.seriesEntries.selectedEntries(),
      boats: this.boatsStore.boats(),
      conflictsInRace: (entry, raceId) => {
        const race = races.find(r => r.id === raceId);
        return !!race && this.entryService.findEntryConflicts({ ...entry, races: [race] }).length > 0;
      },
    });
  });

  private readonly _saving = signal(false);
  readonly saving = this._saving.asReadonly();
  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  private readonly resolvedByCompetitorId = computed(
    () => new Map(this.competitorReader.selectedResolvedCompetitors().map(r => [r.id, r] as const)),
  );

  readonly matchedRows = computed<MatchedRowVm[]>(() =>
    this.rowMatching.buildMatchedRows(this.reviewRows(), this.resolvedByCompetitorId()),
  );

  readonly unmatchedRows = computed<UnmatchedRowVm[]>(() => {
    const rows = this.rowMatching.buildUnmatchedRows(this.reviewRows(), {
      boats: this.boatsStore.boats(),
      classes: this.clubStore.club().classes,
    });
    const entries = this.seriesEntries.selectedEntries();
    const boats = this.boatsStore.boats();
    const competitors = this.competitorReader.selectedResolvedCompetitors();
    return rows.map(vm => {
      const plan = this.planForRow(vm.row, entries, boats, competitors);
      return {
        ...vm,
        planKind: plan.kind,
        possibleHelms: helmLabels(plan, vm.possibleHelms),
      };
    });
  });

  /** Race competitors not already linked to a scan row — candidates for Link. */
  readonly linkableCompetitors = computed(() => {
    const raceIds = this.raceSelection.selectedRaceIds();
    if (raceIds.length === 0) return [];
    const rows = this.reviewRows();
    return raceIds.flatMap((raceId) =>
      this.rowMatching.unmatchedRaceCompetitors(
        this.competitorReader.resolvedForRace(raceId),
        rows,
      ),
    );
  });

  readonly canLink = computed(() => this.linkableCompetitors().length > 0);

  raceLabel(raceId: string | undefined): string {
    if (!raceId) return '-';
    const race = this.raceCalendar.allRaces().find((r) => r.id === raceId);
    if (!race) return raceId;
    const series = race.seriesName?.trim();
    const num = race.index != null ? `R${race.index}` : '';
    return [series, num].filter(Boolean).join(' ') || raceId;
  }

  readonly acceptedMatchedCount = computed(
    () => this.matchedRows().filter(vm => !!vm.row.accepted).length,
  );

  setAcceptance(e: AcceptanceChangedEvent): void {
    this.scanRun.updateAcceptance(e.rowIndex, e.accepted);
  }

  promoteAlternative(
    rowIndex: number,
    field: ScannedValueField,
    chosen: string | number,
  ): void {
    this.scanRun.promoteAlternative(rowIndex, field, chosen);
  }

  private raceIdForRow(row: ScannedResultRow): string | null {
    return row.raceId?.trim() || this.raceSelection.selectedRaceId();
  }

  /** Select a unique match, or open the helm / new-entry dialog when the user asks. */
  async resolveUnmatched(row: ScannedResultRow): Promise<void> {
    const plan = this.planForRow(row);
    if (plan.kind === 'link') {
      this.scanRun.applyRowMatch(row.rowIndex, plan.competitorId);
      return;
    }
    if (plan.kind === 'sign-on-entry') {
      await this.stageEntry(row, entryDetailsFromSeriesEntry(plan.entry));
      return;
    }
    if (plan.kind === 'choose-entry') {
      const picked = await this.pickHelm(row, plan.entries.map(seriesEntryAsBoat));
      const entry = plan.entries.find(e => e.id === picked?.id);
      if (entry) await this.stageEntry(row, entryDetailsFromSeriesEntry(entry));
      return;
    }
    if (plan.kind === 'sign-on-boat') {
      await this.stageEntry(row, entryDetailsFromBoat(plan.boat));
      return;
    }
    if (plan.kind === 'choose-boat') {
      await this.enterKnownBoat(row);
      return;
    }
    await this.enterUnmatched(row);
  }

  /** Undo a staged entry so the row goes back to the unmatched table. */
  unstageRow(row: ScannedResultRow): void {
    this.scanRun.clearRowEntry(row.rowIndex);
  }

  /**
   * Stage a sign-on chosen by the user. Prompts when the entry conflicts with
   * an existing race entry; the swap itself happens on save.
   */
  private async stageEntry(row: ScannedResultRow, details: PendingScanEntry): Promise<void> {
    const race = this.raceCalendar.allRaces().find(r => r.id === this.raceIdForRow(row));
    if (!race) return;
    const duplicate = this.duplicateStagedRow(row, details, race);
    if (duplicate) {
      this.snackbar.open(
        `Row ${duplicate.rowIndex} already uses ${describeIdentity(details)}.`,
        'Dismiss',
        { duration: 5000 },
      );
      return;
    }
    const conflicts = this.entryService.findEntryConflicts({ ...details, races: [race] });
    if (conflicts.length > 0) {
      const choice = await this.dialogs.promptEntryConflict(conflicts.map(summariseConflict));
      if (choice === 'cancel') return;
    }
    this.scanRun.stageRowEntry(row.rowIndex, {
      ...details,
      ...(conflicts.length > 0 ? { swapConflicts: true } : {}),
    });
  }

  /** Another row in the same race already staged, by the user or automatically, for the same boat and helm. */
  private duplicateStagedRow(
    row: ScannedResultRow,
    details: PendingScanEntry,
    race: Race,
  ): ScannedResultRow | undefined {
    return this.reviewRows().find(other =>
      other.rowIndex !== row.rowIndex &&
      !!other.pendingEntry &&
      this.raceIdForRow(other) === race.id &&
      sameStagedIdentity(other.pendingEntry, details),
    );
  }

  private planForRow(
    row: ScannedResultRow,
    entries = this.seriesEntries.selectedEntries(),
    boats = this.boatsStore.boats(),
    competitors = this.competitorReader.selectedResolvedCompetitors(),
  ): ScanRowIdentityPlan {
    return classifyScanRow(row, {
      race: this.raceRefFor(row, this.raceCalendar.allRaces()),
      competitors,
      seriesEntries: entries,
      boats,
    });
  }

  private raceRefFor(row: ScannedResultRow, races: readonly Race[]): { id: string; seriesId: string } | null {
    const raceId = this.raceIdForRow(row);
    const race = races.find(r => r.id === raceId);
    if (!race) return null;
    return { id: race.id, seriesId: race.seriesId };
  }

  private async pickHelm(row: ScannedResultRow, boats: Boat[]): Promise<Boat | undefined> {
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (!boatClass || !sailNumber || boats.length === 0) return undefined;
    const dialogRef = this.dialog.open(KnownBoatEntryDialog, {
      width: '520px',
      data: { boatClass, sailNumber, boats },
    });
    const result = (await firstValueFrom(dialogRef.afterClosed())) as
      | KnownBoatEntryDialogResult
      | undefined;
    if (!result?.selectedBoatId) return undefined;
    return boats.find(b => b.id === result.selectedBoatId);
  }

  async enterKnownBoat(row: ScannedResultRow): Promise<void> {
    if (!this.hasEntryIdentity(row)) return;
    const matches = this.rowMatching.findBoatMatches(row, this.boatsStore.boats());
    if (matches.length === 0) {
      await this.enterUnmatched(row);
      return;
    }
    const boat = await this.pickHelm(row, matches);
    if (boat) await this.stageEntry(row, entryDetailsFromBoat(boat));
  }

  async enterUnmatched(row: ScannedResultRow): Promise<void> {
    if (!this.hasEntryIdentity(row)) return;
    const boatClass = row.boatClass!.value.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber!.value);

    const dialogRef = this.dialog.open(UnmatchedRowEntryDialog, {
      width: '420px',
      data: { boatClass, sailNumber },
    });
    const result = (await firstValueFrom(dialogRef.afterClosed())) as
      | UnmatchedRowEntryDialogResult
      | undefined;
    if (!result) return;
    await this.stageEntry(row, {
      helm: result.helm,
      crew: result.crew,
      boatClass,
      sailNumber,
      divisions: [],
    });
  }

  private hasEntryIdentity(row: ScannedResultRow): boolean {
    const raceId = this.raceIdForRow(row);
    const boatClass = row.boatClass?.value?.trim();
    const sailNumber = normalizeSailNumber(row.sailNumber?.value);
    if (raceId && boatClass && sailNumber) return true;
    this.snackbar.open('Class and sail number are required to create an entry.', 'Dismiss', {
      duration: 4000,
    });
    return false;
  }

  async linkScanRow(row: ScannedResultRow): Promise<void> {
    const raceId = this.raceIdForRow(row);
    const competitors = raceId
      ? this.rowMatching.unmatchedRaceCompetitors(
          this.competitorReader.resolvedForRace(raceId),
          this.scanRun.scanResult()?.scannedResults ?? [],
        )
      : this.linkableCompetitors();
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
    const sessionRaceId = this.raceSelection.selectedRaceId();
    if (!sessionRaceId) return;
    const sessionRace = this.raceSelection.selectedRace();
    if (!sessionRace) {
      this._error.set('Select a race first.');
      return;
    }
    const isLevelRating = this.isLevelRatingScan();
    const preSaveCompetitorsById = new Map(
      this.competitorStore.selectedCompetitors().map(c => [c.id, c] as const),
    );
    const acceptedMatchedItems = this.matchedRows().filter(
      vm => vm.row.accepted && (!!vm.row.matchedCompetitorId || !!vm.row.pendingEntry),
    );
    if (acceptedMatchedItems.length === 0) {
      this._error.set('No accepted matched rows to save.');
      return;
    }
    this._error.set(null);
    this._saving.set(true);
    try {
      const linkedItems = acceptedMatchedItems.filter(vm => !vm.row.pendingEntry);
      const acceptedMatchedIds = linkedItems
        .map(vm => vm.row.matchedCompetitorId!)
        .filter(Boolean);
      const missingMatchedIds = linkedItems
        .filter(vm => {
          const competitorId = vm.row.matchedCompetitorId;
          return !competitorId || !this.resolvedByCompetitorId().has(competitorId);
        })
        .map(vm => vm.row.matchedCompetitorId!);
      if (missingMatchedIds.length > 0) {
        const diagnostic = {
          raceIdFromForm: sessionRaceId,
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
      const racesById = new Map(this.raceCalendar.allRaces().map((r) => [r.id, r] as const));
      const raceForRow = (row: ScannedResultRow): Race =>
        racesById.get(this.raceIdForRow(row) ?? sessionRaceId) ?? sessionRace;
      const hasResult = (row: ScannedResultRow): boolean => {
        if (!isLevelRating) return true;
        const position = row.position?.value;
        return position != null && Number.isFinite(position);
      };
      await withTimeout(
        (async () => {
          const createdByRow = new Map<number, RaceCompetitor>();
          for (const vm of acceptedMatchedItems) {
            if (!vm.row.pendingEntry || !hasResult(vm.row)) continue;
            const competitor = await this.createStagedEntry(vm.row, vm.row.pendingEntry, raceForRow(vm.row));
            createdByRow.set(vm.row.rowIndex, competitor);
          }

          for (const vm of acceptedMatchedItems) {
            if (!hasResult(vm.row)) continue;
            const competitor = createdByRow.get(vm.row.rowIndex) ??
              this.resolvedByCompetitorId().get(vm.row.matchedCompetitorId ?? '');
            if (!competitor) continue;
            const race = raceForRow(vm.row);

            if (isLevelRating) {
              const position = vm.row.position!.value;
              await this.manualResults.recordResult(competitor, race, {
                finishTime: null,
                laps: 1,
                position,
                resultCode: this.rowMatching.normalizeResultCode(vm.row.status),
                scoringSheetRow: vm.row.rowIndex,
              });
            } else {
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
          }
          await this.scanPersistence.clearScanResponse(sessionRaceId);
        })(),
        FIRESTORE_BULK_WRITE_TIMEOUT_MS,
        'Saving scan results',
      );
      await this.router.navigate(['/results-input/manual'], { queryParams: { raceId: sessionRaceId } });
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

  /**
   * Creates the series entry and race competitor for a staged row, then links
   * the row so a retry after a later failure does not create it twice.
   */
  private async createStagedEntry(
    row: ScannedResultRow,
    pending: PendingScanEntry,
    race: Race,
  ): Promise<RaceCompetitor> {
    const { swapConflicts, ...entry } = pending;
    const details: EntryDetails = { ...entry, races: [race] };
    const conflicts = this.entryService.findEntryConflicts(details);
    if (conflicts.length > 0 && !swapConflicts) {
      throw new ScoreSmarterError(
        `Row ${row.rowIndex}: ${describeIdentity(entry)} is already entered in this race. ` +
        'Undo the entry selection or use Link.',
      );
    }
    const [competitor] = conflicts.length > 0
      ? await this.entryService.swapAndEnter(details, conflicts)
      : await this.entryService.enterRaces(details);
    if (!competitor) {
      throw new ScoreSmarterError(`Row ${row.rowIndex}: entry for ${describeIdentity(entry)} was not created.`);
    }
    this.scanRun.applyRowMatch(row.rowIndex, competitor.id);
    return competitor;
  }
}

function summariseConflict(c: EntryConflict): EntryConflictSummary {
  const e = c.existingEntry;
  const existingLabel = `${e.helm} – ${e.boatClass} #${e.sailNumber}`;
  const raceLabel = `${c.race.seriesName} race ${c.race.index}`;
  const reasonLabel = (() => {
    switch (c.reason) {
      case 'sameEntry':
        return 'Exact same boat is already entered.';
      case 'sameHelmDifferentHull':
        return 'This series merges by helm, so a sailor can only enter one boat per race.';
      case 'sameHullDifferentHelm':
        return 'This series merges by boat, so a hull can only be entered once per race.';
    }
  })();
  return { raceLabel, existingLabel, reasonLabel };
}

function helmLabels(plan: ScanRowIdentityPlan, fallback: string[]): string[] {
  if (plan.kind === 'choose-entry') return plan.entries.map(e => e.helm);
  if (plan.kind === 'choose-boat') return plan.boats.map(b => b.helm);
  if (plan.kind === 'sign-on-entry') return [plan.entry.helm];
  if (plan.kind === 'sign-on-boat') return [plan.boat.helm];
  return fallback;
}

function seriesEntryAsBoat(entry: SeriesEntry): Boat {
  return {
    id: entry.id,
    helm: entry.helm,
    crew: entry.crew ?? '',
    name: entry.boatName ?? '',
    boatClass: entry.boatClass,
    sailNumber: entry.sailNumber,
    isClub: false,
    handicaps: entry.handicaps,
    personalHandicapBand: entry.personalHandicapBand,
  };
}
