import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { BoatsStore } from 'app/boats';
import { helmNamesEqual } from 'app/boats/model/helm-name';
import { normalizeSailNumber, sailNumberDistance, sailNumbersEqual } from 'app/boats/model/sail-number';
import { EntryConflict, EntryDetails, EntryService } from 'app/entry/services/entry.service';
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
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { RaceCompetitorMutator } from '../../services/race-competitor-mutator';
import { RaceCompetitorReader } from '../../services/race-competitor-reader';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { SeriesEntryStore } from '../../services/series-entry-store';
import { describeIdentity } from '../../services/series-entry-identity';
import {
  ScanRowEditDialog,
  type ScanRowEditDialogData,
  type ScanRowEditDialogResult,
  type ScanRowLookup,
} from './scan-row-edit-dialog';
import { ScanSelectedRace } from '../select-race/race-selection.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { ScanPersistenceService } from '../shared/scan-persistence.service';
import { boatClassesMatch, RowConflict, ScanRowMatchingService } from './scan-row-matching.service';
import {
  applyAutomaticMatch,
  classifyScanRow,
  helmCandidates,
  sameStagedIdentity,
  ScanRowIdentityPlan,
  ScanRowIdentitySources,
} from './scan-row-provision';
import {
  AcceptanceChangedEvent,
  ScanGridRowVm,
  ScanReviewSummary,
} from './review-step';
import { PendingScanEntry, ScannedResultRow } from '../model/scan-model';
import type { ScannedValueField } from '../run-scan/promote-scanned-alternative';

export type NotOnSheetAction = 'none' | 'DNC' | 'DNS' | 'delete';

export interface LinkSuggestion {
  rowIndex: number;
  label: string;
}

/**
 * Area 4 — owns the review grid view models, the row dialogs, the race entries that
 * are not on the sheet, and the save pipeline. Reads the editable working copy from
 * {@link ScanRunStore} and writes the user's choices back through it.
 */
@Injectable()
export class ScanReviewStore {
  private readonly scanRun = inject(ScanRunStore);
  private readonly raceSelection = inject(ScanSelectedRace);
  private readonly rowMatching = inject(ScanRowMatchingService);
  private readonly competitorReader = inject(RaceCompetitorReader);
  private readonly competitorStore = inject(RaceCompetitorStore);
  private readonly competitorMutator = inject(RaceCompetitorMutator);
  private readonly manualResults = inject(ManualResultsService);
  private readonly scanPersistence = inject(ScanPersistenceService);
  private readonly boatsStore = inject(BoatsStore);
  private readonly seriesEntries = inject(SeriesEntryStore);
  private readonly entryService = inject(EntryService);
  private readonly clubStore = inject(ClubStore);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(DialogsService);
  private readonly router = inject(Router);

  readonly isLevelRatingScan = computed(() => this.raceSelection.isLevelRatingSelection());

  readonly displayedColumns = computed<readonly string[]>(() =>
    this.isLevelRatingScan()
      ? ['accept', 'rowIndex', 'sailNumber', 'boatClass', 'helm', 'race', 'position', 'status', 'overall', 'actions']
      : ['accept', 'rowIndex', 'sailNumber', 'boatClass', 'helm', 'time', 'status', 'laps', 'overall', 'actions'],
  );

  private readonly workingRows = computed(() => this.scanRun.scanResult()?.scannedResults ?? []);

  private readonly identitySources = computed<Omit<ScanRowIdentitySources, 'race'>>(() => ({
    competitors: this.competitorReader.selectedResolvedCompetitors(),
    seriesEntries: this.seriesEntries.selectedEntries(),
    boats: this.boatsStore.boats(),
    classes: this.clubStore.club().classes.map(c => c.name),
  }));

  /** How each row would be matched from its scanned values, keyed by row index. */
  readonly rowPlans = computed(() => {
    const races = this.raceCalendar.allRaces();
    const sources = this.identitySources();
    return new Map<number, ScanRowIdentityPlan>(
      this.workingRows().map(row => [
        row.rowIndex,
        classifyScanRow(row, { ...sources, race: this.raceRefFor(row, races) }),
      ]),
    );
  });

  /**
   * Working-copy rows with automatic matches applied. The working copy holds only
   * the user's explicit choices; unique matches are derived so they follow edits.
   */
  readonly reviewRows = computed<ScannedResultRow[]>(() => {
    const plans = this.rowPlans();
    return this.workingRows().map(row => applyAutomaticMatch(row, plans.get(row.rowIndex) ?? { kind: 'skip' }));
  });

  /** Accepted rows that cannot be saved as they stand. Unaccepted rows never conflict. */
  readonly rowConflicts = computed(() => {
    const races = this.raceCalendar.allRaces();
    const conflicts = new Map<number, RowConflict>();
    const accepted = this.reviewRows().filter(r => r.accepted && (r.matchedCompetitorId || r.pendingEntry));

    accepted.forEach((row, i) => {
      const raceId = this.raceIdForRow(row);
      const twin = accepted.find((other, j) =>
        j !== i &&
        this.raceIdForRow(other) === raceId &&
        (row.matchedCompetitorId
          ? other.matchedCompetitorId === row.matchedCompetitorId
          : !!other.pendingEntry && sameStagedIdentity(other.pendingEntry, row.pendingEntry!)),
      );
      if (twin) {
        conflicts.set(row.rowIndex, { reason: `Same boat as row ${twin.rowIndex}`, canReplaceExisting: false });
        return;
      }
      if (!row.pendingEntry || row.pendingEntry.swapConflicts) return;
      const race = races.find(r => r.id === raceId);
      if (!race) return;
      const [clash] = this.entryService.findEntryConflicts({ ...row.pendingEntry, races: [race] });
      if (clash) {
        conflicts.set(row.rowIndex, {
          reason: `Already entered in this race: ${describeIdentity(clash.existingEntry)}`,
          canReplaceExisting: true,
        });
      }
    });
    return conflicts;
  });

  private readonly resolvedByCompetitorId = computed(
    () => new Map(this.competitorReader.selectedResolvedCompetitors().map(r => [r.id, r] as const)),
  );

  /** Race entries in the selected races with no result that no accepted row is linked to. */
  readonly notOnSheet = computed<ResolvedRaceCompetitor[]>(() => {
    const linked = new Set(
      this.reviewRows()
        .filter(r => r.accepted && r.matchedCompetitorId)
        .map(r => r.matchedCompetitorId!),
    );
    return this.raceSelection.selectedRaceIds().flatMap(raceId =>
      this.competitorReader
        .resolvedForRace(raceId)
        .filter(c => c.resultCode === 'NOT FINISHED' && !linked.has(c.id)),
    );
  });

  /** Staged rows whose sail number is one character away from a race entry that is not on the sheet. */
  private readonly nearMissRows = computed(() => {
    const missing = this.notOnSheet();
    return new Set(
      this.reviewRows()
        .filter(row => {
          const entry = row.pendingEntry;
          if (!entry) return false;
          const raceId = this.raceIdForRow(row);
          return missing.some(c =>
            c.raceId === raceId &&
            boatClassesMatch(c.boatClass, entry.boatClass) &&
            sailNumberDistance(c.sailNumber, entry.sailNumber) === 1,
          );
        })
        .map(row => row.rowIndex),
    );
  });

  readonly gridRows = computed<ScanGridRowVm[]>(() =>
    this.rowMatching.buildGridRows(this.reviewRows(), {
      plans: this.rowPlans(),
      conflicts: this.rowConflicts(),
      resolvedById: this.resolvedByCompetitorId(),
      nearMissRows: this.nearMissRows(),
    }),
  );

  readonly summary = computed<ScanReviewSummary>(() => {
    const count = (status: ScanGridRowVm['status']) => this.gridRows().filter(vm => vm.status === status).length;
    return {
      matched: count('matched'),
      newEntries: count('new-entry'),
      chooseHelm: count('choose-helm'),
      noMatch: count('no-match'),
      conflicts: count('conflict'),
    };
  });

  private readonly _attentionSnapshot = signal<ReadonlySet<number> | null>(null);
  readonly needsAttentionOnly = computed(() => this._attentionSnapshot() !== null);

  /**
   * Rows shown in the grid. The attention filter keeps the rows that needed attention
   * when it was switched on, so a row does not vanish while the user fixes it.
   */
  readonly visibleRows = computed(() => {
    const snapshot = this._attentionSnapshot();
    return snapshot ? this.gridRows().filter(vm => snapshot.has(vm.row.rowIndex)) : this.gridRows();
  });

  setNeedsAttentionOnly(on: boolean): void {
    this._attentionSnapshot.set(
      on ? new Set(this.gridRows().filter(needsAttention).map(vm => vm.row.rowIndex)) : null,
    );
  }

  private readonly _saving = signal(false);
  readonly saving = this._saving.asReadonly();
  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  private readonly _notOnSheetActions = signal<ReadonlyMap<string, NotOnSheetAction>>(new Map());

  notOnSheetAction(competitorId: string): NotOnSheetAction {
    return this._notOnSheetActions().get(competitorId) ?? 'none';
  }

  setNotOnSheetAction(competitorId: string, action: NotOnSheetAction): void {
    this._notOnSheetActions.update(current => new Map(current).set(competitorId, action));
  }

  markAllNotOnSheetDnc(): void {
    this._notOnSheetActions.update(current => {
      const next = new Map(current);
      for (const c of this.notOnSheet()) {
        if ((next.get(c.id) ?? 'none') === 'none') next.set(c.id, 'DNC');
      }
      return next;
    });
  }

  /** Link a race entry that is not on the sheet to a scanned row, replacing the row's match. */
  linkEntryToRow(competitorId: string, rowIndex: number): void {
    this._notOnSheetActions.update(current => {
      const next = new Map(current);
      next.delete(competitorId);
      return next;
    });
    this.scanRun.applyRowMatch(rowIndex, competitorId);
  }

  readonly linkSuggestionsById = computed(
    () => new Map(this.notOnSheet().map(c => [c.id, this.linkSuggestions(c)] as const)),
  );

  /** Rows a race entry may have been misread as: unmatched rows first, then by sail number distance. */
  linkSuggestions(competitor: ResolvedRaceCompetitor): LinkSuggestion[] {
    const rank = (vm: ScanGridRowVm): number => {
      if (vm.status === 'no-match') return 0;
      if (vm.nearMissSail) return 1;
      return 2;
    };
    return this.gridRows()
      .filter(vm => vm.status !== 'matched' && this.raceIdForRow(vm.row) === competitor.raceId)
      .map(vm => ({ vm, distance: sailNumberDistance(vm.row.sailNumber?.value, competitor.sailNumber) }))
      .sort((a, b) => rank(a.vm) - rank(b.vm) || a.distance - b.distance || a.vm.row.rowIndex - b.vm.row.rowIndex)
      .map(({ vm }) => ({
        rowIndex: vm.row.rowIndex,
        label: [
          `Row ${vm.row.rowIndex}:`,
          vm.row.boatClass?.value,
          vm.row.sailNumber?.value,
          vm.identity?.helm ?? vm.row.competitorName?.value,
        ].filter(Boolean).join(' '),
      }));
  }

  raceLabel(raceId: string | undefined): string {
    if (!raceId) return '-';
    const race = this.raceCalendar.allRaces().find((r) => r.id === raceId);
    if (!race) return raceId;
    const series = race.seriesName?.trim();
    const num = race.index != null ? `R${race.index}` : '';
    return [series, num].filter(Boolean).join(' ') || raceId;
  }

  private readonly acceptedRows = computed(() => this.gridRows().filter(vm => vm.canAccept && !!vm.row.accepted));

  readonly acceptedMatchedCount = computed(() => this.acceptedRows().length);

  readonly canSave = computed(() =>
    this.acceptedMatchedCount() > 0 ||
    this.notOnSheet().some(c => this.notOnSheetAction(c.id) !== 'none'),
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

  /** Apply a helm select option: `candidate:<helm>`, `new:<helm>` or `edit`. */
  async chooseHelm(row: ScannedResultRow, option: string): Promise<void> {
    if (option === 'edit') {
      await this.editRow(row);
      return;
    }
    const plan = this.rowPlans().get(row.rowIndex);
    const candidates = plan?.kind === 'sign-on' || plan?.kind === 'choose-helm' ? plan.candidates : [];
    if (option.startsWith('candidate:')) {
      const helm = option.slice('candidate:'.length);
      const candidate = candidates.find(c => c.helm === helm);
      if (candidate) await this.stageEntry(row, candidate.entry);
      return;
    }
    if (option.startsWith('new:')) {
      const reference = candidates[0]?.entry;
      const boatClass = reference?.boatClass ?? row.boatClass?.value?.trim();
      const sailNumber = reference?.sailNumber ?? normalizeSailNumber(row.sailNumber?.value);
      if (!boatClass || !sailNumber) return;
      await this.stageEntry(row, { helm: option.slice('new:'.length), boatClass, sailNumber, divisions: [] });
    }
  }

  /** Agree to replace the race entries a staged row clashes with. The swap happens on save. */
  async replaceExisting(row: ScannedResultRow): Promise<void> {
    const race = this.raceFor(row);
    const entry = row.pendingEntry;
    if (!race || !entry) return;
    const conflicts = this.entryService.findEntryConflicts({ ...entry, races: [race] });
    if (conflicts.length === 0) return;
    const choice = await this.dialogs.promptEntryConflict(conflicts.map(summariseConflict));
    if (choice === 'cancel') return;
    this.scanRun.stageRowEntry(row.rowIndex, { ...entry, swapConflicts: true });
  }

  /** Correct the row's class, sail number and helm, then link it or stage its entry. */
  async editRow(row: ScannedResultRow): Promise<void> {
    const race = this.raceFor(row);
    if (!race) return;
    const classes = this.clubStore.club().classes.map(c => c.name);
    const scannedClass = row.pendingEntry?.boatClass ?? row.boatClass?.value;
    const data: ScanRowEditDialogData = {
      rowIndex: row.rowIndex,
      boatClass: classes.find(name => boatClassesMatch(name, scannedClass)),
      sailNumber: normalizeSailNumber(row.pendingEntry?.sailNumber ?? row.sailNumber?.value) || undefined,
      helm: row.pendingEntry?.helm ?? row.competitorName?.value,
      classes,
      lookup: (boatClass, sailNumber) => this.lookupIdentity(race, boatClass, sailNumber),
    };
    const dialogRef = this.dialog.open(ScanRowEditDialog, { width: '440px', data });
    const result = (await firstValueFrom(dialogRef.afterClosed())) as ScanRowEditDialogResult | undefined;
    if (!result) return;

    this.scanRun.editRowIdentity(row.rowIndex, result);
    const competitor = this.raceEntryFor(race, result.boatClass, result.sailNumber);
    if (competitor) {
      this.scanRun.applyRowMatch(row.rowIndex, competitor.id);
      return;
    }
    const candidate = helmCandidates(result.boatClass, result.sailNumber, race.seriesId, this.identitySources())
      .find(c => helmNamesEqual(c.helm, result.helm));
    const details: PendingScanEntry = candidate
      ? { ...candidate.entry, ...(result.crew ? { crew: result.crew } : {}) }
      : {
          helm: result.helm,
          crew: result.crew,
          boatClass: result.boatClass,
          sailNumber: result.sailNumber,
          divisions: [],
        };
    await this.stageEntry(row, details);
  }

  private lookupIdentity(race: Race, boatClass: string, sailNumber: string): ScanRowLookup {
    const competitor = this.raceEntryFor(race, boatClass, sailNumber);
    if (competitor) return { enteredAs: competitor.helm, candidates: [] };
    return {
      candidates: helmCandidates(boatClass, sailNumber, race.seriesId, this.identitySources())
        .map(({ helm, source }) => ({ helm, source })),
    };
  }

  private raceEntryFor(race: Race, boatClass: string, sailNumber: string): ResolvedRaceCompetitor | undefined {
    return this.competitorReader.selectedResolvedCompetitors().find(c =>
      c.raceId === race.id &&
      boatClassesMatch(c.boatClass, boatClass) &&
      sailNumbersEqual(c.sailNumber, sailNumber),
    );
  }

  /**
   * Stage an entry chosen by the user and accept the row. Prompts when the entry
   * clashes with an existing race entry; the swap itself happens on save.
   */
  private async stageEntry(row: ScannedResultRow, details: PendingScanEntry): Promise<void> {
    const race = this.raceFor(row);
    if (!race) return;
    const entry: PendingScanEntry = { ...details };
    delete entry.swapConflicts;
    const conflicts = this.entryService.findEntryConflicts({ ...entry, races: [race] });
    if (conflicts.length > 0) {
      const choice = await this.dialogs.promptEntryConflict(conflicts.map(summariseConflict));
      if (choice === 'cancel') return;
    }
    this.scanRun.stageRowEntry(row.rowIndex, {
      ...entry,
      ...(conflicts.length > 0 ? { swapConflicts: true } : {}),
    });
  }

  private raceFor(row: ScannedResultRow): Race | undefined {
    const raceId = this.raceIdForRow(row);
    return this.raceCalendar.allRaces().find(r => r.id === raceId);
  }

  private raceRefFor(row: ScannedResultRow, races: readonly Race[]): { id: string; seriesId: string } | null {
    const raceId = this.raceIdForRow(row);
    const race = races.find(r => r.id === raceId);
    if (!race) return null;
    return { id: race.id, seriesId: race.seriesId };
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
    const acceptedItems = this.acceptedRows();
    const notOnSheetWork = this.notOnSheet()
      .map(competitor => ({ competitor, action: this.notOnSheetAction(competitor.id) }))
      .filter((item): item is { competitor: ResolvedRaceCompetitor; action: Exclude<NotOnSheetAction, 'none'> } =>
        item.action !== 'none');
    if (acceptedItems.length === 0 && notOnSheetWork.length === 0) {
      this._error.set('No accepted rows to save.');
      return;
    }
    const conflicting = acceptedItems.filter(vm => vm.status === 'conflict');
    if (conflicting.length > 0) {
      this._error.set(
        conflicting.map(vm => `Row ${vm.row.rowIndex}: ${vm.reason}.`).join(' ') +
        ' Untick one of the rows or replace the existing entry.',
      );
      return;
    }
    this._error.set(null);
    this._saving.set(true);
    try {
      const linkedItems = acceptedItems.filter(vm => !vm.row.pendingEntry);
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
          for (const vm of acceptedItems) {
            if (!vm.row.pendingEntry || !hasResult(vm.row)) continue;
            const competitor = await this.createStagedEntry(vm.row, vm.row.pendingEntry, raceForRow(vm.row));
            createdByRow.set(vm.row.rowIndex, competitor);
          }

          for (const vm of acceptedItems) {
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

          for (const { competitor, action } of notOnSheetWork) {
            if (action === 'delete') {
              await this.competitorMutator.deleteRaceCompetitor(competitor);
              continue;
            }
            const race = racesById.get(competitor.raceId);
            if (!race) continue;
            await this.manualResults.recordResult(competitor, race, { finishTime: null, laps: 1, resultCode: action });
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
        'Untick the row or replace the existing entry.',
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

/** Rows the user still has to look at. */
export function needsAttention(vm: ScanGridRowVm): boolean {
  return vm.status === 'choose-helm' || vm.status === 'no-match' || vm.status === 'conflict' ||
    vm.lowConfidence || vm.nearMissSail;
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
