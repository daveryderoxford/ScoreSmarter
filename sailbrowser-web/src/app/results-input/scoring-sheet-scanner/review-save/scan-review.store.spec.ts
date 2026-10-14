import { computed, Injectable, signal, WritableSignal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { BoatsStore } from 'app/boats';
import { EntryDetails, EntryService } from 'app/entry/services/entry.service';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { RaceCompetitor } from '../../model/race-competitor';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { SeriesEntry } from '../../model/series-entry';
import { ManualResultsService } from '../../services/manual-results.service';
import { RaceCompetitorReader } from '../../services/race-competitor-reader';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { SeriesEntryStore } from '../../services/series-entry-store';
import type { ScannerTimeFormat } from '@shared/scanner-context';
import { PendingScanEntry, ScanResponse, ScannedResultRow } from '../model/scan-model';
import { ScanSelectedRace } from '../select-race/race-selection.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { ScanPersistenceService } from '../shared/scan-persistence.service';
import { ScanReviewStore } from './scan-review.store';
import { ScanRowMatchingService } from './scan-row-matching.service';
import { of } from 'rxjs';

const RACE_ID = 'r1';
const COMPETITOR_ID = 'c1';
const UNLINKED_ID = 'c2';

const race: Race = {
  id: RACE_ID,
  seriesName: 'Series',
  fleetId: 'f1',
  index: 1,
  seriesId: 's1',
  scheduledStart: new Date('2026-06-10T14:00:00Z'),
  raceOfDay: 1,
  type: 'Handicap',
  status: 'Future',
  isDiscardable: true,
  isAverageLap: false,
  resultsSheetImage: '',
  dirty: false,
};

const scanResponse: ScanResponse = {
  unreadableRowsCount: 0,
  scannedResults: [
    {
      rowIndex: 1,
      overallRowConfidence: 'HIGH',
      accepted: true,
      matchedCompetitorId: COMPETITOR_ID,
      sailNumber: { value: '1234', confidence: 'HIGH' },
      boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
      time: { value: '14:45:00', confidence: 'HIGH' },
      laps: { value: 3, confidence: 'HIGH' },
      status: 'OK',
    },
    {
      rowIndex: 2,
      overallRowConfidence: 'MANUAL_CHECK',
      accepted: false,
      sailNumber: { value: '????', confidence: 'FAILED' },
      boatClass: { value: '', confidence: 'FAILED' },
      time: { value: '14:50:00', confidence: 'HIGH' },
      laps: { value: 3, confidence: 'HIGH' },
      status: 'OK',
    },
  ],
};

function resolvedCompetitor(id = COMPETITOR_ID, sail = '1234'): ResolvedRaceCompetitor {
  return new ResolvedRaceCompetitor(
    { id, raceId: RACE_ID, seriesEntryId: `e-${id}`, resultCode: 'NOT FINISHED' } as RaceCompetitor,
    {
      id: `e-${id}`,
      seriesId: 's1',
      helm: id === COMPETITOR_ID ? 'Alex' : 'Blake',
      boatClass: 'ILCA 7',
      sailNumber: sail,
    } as SeriesEntry,
  );
}

@Injectable()
class FakeScanRunStore {
  private readonly fb = new FormBuilder();
  readonly contextForm = this.fb.nonNullable.group({
    listOrder: ['chronological', Validators.required],
    timeFormat: this.fb.nonNullable.control<ScannerTimeFormat>('clock_hms', Validators.required),
    defaultLaps: [1, [Validators.min(1), Validators.max(20)]],
    model: this.fb.nonNullable.control('gemini-3.7-flash', Validators.required),
    thinkingLevel: this.fb.nonNullable.control('medium'),
    specialInstructions: [''],
    debug: [false],
  });
  private readonly _scanResult = signal<ScanResponse | null>(structuredClone(scanResponse));
  readonly scanResult = this._scanResult.asReadonly();
  setScanResult(result: ScanResponse): void {
    this._scanResult.set(structuredClone(result));
  }
  applyRowMatch = vi.fn((rowIndex: number, competitorId: string) => {
    this.updateRow(rowIndex, row => {
      const next = { ...row, matchedCompetitorId: competitorId, accepted: true };
      delete next.pendingEntry;
      return next;
    });
  });
  stageRowEntry = vi.fn((rowIndex: number, pendingEntry: PendingScanEntry) => {
    this.updateRow(rowIndex, row => ({ ...row, pendingEntry, accepted: true }));
  });
  clearRowEntry = vi.fn((rowIndex: number) => {
    this.updateRow(rowIndex, row => {
      const next = { ...row, autoMatchDismissed: true, accepted: false };
      delete next.pendingEntry;
      return next;
    });
  });
  updateAcceptance(rowIndex: number, accepted: boolean): void {
    this.updateRow(rowIndex, row => ({ ...row, accepted }));
  }
  defaultHourForParsing(): number {
    return 14;
  }
  row(rowIndex: number): ScannedResultRow | undefined {
    return this._scanResult()?.scannedResults.find(r => r.rowIndex === rowIndex);
  }
  private updateRow(rowIndex: number, fn: (row: ScannedResultRow) => ScannedResultRow): void {
    this._scanResult.update(current => {
      if (!current) return current;
      return {
        ...current,
        scannedResults: current.scannedResults.map(row => (row.rowIndex === rowIndex ? fn(row) : row)),
      };
    });
  }
}

@Injectable()
class FakeRaceSelectionStore {
  readonly selectedRaceIds = signal([RACE_ID]).asReadonly();
  readonly selectedRaceId = signal(RACE_ID).asReadonly();
  readonly selectedRace = computed(() => race);
  readonly isLevelRatingSelection = signal(false).asReadonly();
  select = vi.fn();
  selectMany = vi.fn();
}

@Injectable()
class FakeRaceCompetitorReader {
  readonly selectedResolvedCompetitors = signal([
    resolvedCompetitor(COMPETITOR_ID, '1234'),
    resolvedCompetitor(UNLINKED_ID, '9999'),
  ]).asReadonly();
  resolvedForRace(raceId: string): ResolvedRaceCompetitor[] {
    return this.selectedResolvedCompetitors().filter(c => c.raceId === raceId);
  }
}

@Injectable()
class FakeRaceCompetitorStore {
  readonly selectedCompetitors = signal([
    { id: COMPETITOR_ID, raceId: RACE_ID, seriesEntryId: 'e1', resultCode: 'NOT FINISHED' },
    { id: UNLINKED_ID, raceId: RACE_ID, seriesEntryId: 'e2', resultCode: 'NOT FINISHED' },
  ] as RaceCompetitor[]).asReadonly();
}

function seriesEntry(id: string, helm: string, sailNumber: string): SeriesEntry {
  return {
    id,
    seriesId: 's1',
    helm,
    boatClass: 'ILCA 7',
    sailNumber,
    handicaps: [],
    divisions: [],
  };
}

function unmatchedRow(rowIndex: number, sailNumber: string): ScannedResultRow {
  return {
    rowIndex,
    overallRowConfidence: 'HIGH',
    accepted: true,
    sailNumber: { value: sailNumber, confidence: 'HIGH' },
    boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
    time: { value: '14:55:00', confidence: 'HIGH' },
    laps: { value: 3, confidence: 'HIGH' },
    status: 'OK',
  };
}

/** Row 1 is already linked; rows 3 and 4 match series entries but have no race competitor. */
const stagingScan: ScanResponse = {
  unreadableRowsCount: 0,
  scannedResults: [scanResponse.scannedResults[0], unmatchedRow(3, '5555'), unmatchedRow(4, '6666')],
};

describe('ScanReviewStore.save', () => {
  let store: ScanReviewStore;
  let scanRun: FakeScanRunStore;
  let recordResult: ReturnType<typeof vi.fn>;
  let clearScanResponse: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let applyRowMatch: ReturnType<typeof vi.fn>;
  let dialogOpen: ReturnType<typeof vi.fn>;
  let enterRaces: Mock<(details: EntryDetails) => Promise<RaceCompetitor[]>>;
  let swapAndEnter: Mock<(details: EntryDetails, conflicts: unknown[]) => Promise<RaceCompetitor[]>>;
  let findEntryConflicts: ReturnType<typeof vi.fn>;
  let promptEntryConflict: ReturnType<typeof vi.fn>;
  let seriesEntries: WritableSignal<SeriesEntry[]>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    recordResult = vi.fn().mockResolvedValue(undefined);
    clearScanResponse = vi.fn().mockResolvedValue(undefined);
    navigate = vi.fn().mockResolvedValue(true);
    dialogOpen = vi.fn();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* empty */ });
    let created = 0;
    enterRaces = vi.fn(async (details: EntryDetails) => [
      new RaceCompetitor({
        id: `new-${++created}`,
        raceId: details.races[0].id,
        seriesId: 's1',
        seriesEntryId: `e-new-${created}`,
      }),
    ]);
    swapAndEnter = vi.fn(async (details: EntryDetails) => enterRaces(details));
    findEntryConflicts = vi.fn().mockReturnValue([]);
    promptEntryConflict = vi.fn().mockResolvedValue('swap');
    seriesEntries = signal<SeriesEntry[]>([]);

    TestBed.configureTestingModule({
      providers: [
        ScanReviewStore,
        ScanRowMatchingService,
        { provide: ScanRunStore, useClass: FakeScanRunStore },
        { provide: ScanSelectedRace, useClass: FakeRaceSelectionStore },
        { provide: RaceCompetitorReader, useClass: FakeRaceCompetitorReader },
        { provide: RaceCompetitorStore, useClass: FakeRaceCompetitorStore },
        { provide: ManualResultsService, useValue: { recordResult } },
        { provide: ScanPersistenceService, useValue: { clearScanResponse } },
        { provide: BoatsStore, useValue: { boats: signal([]).asReadonly(), isLoading: signal(false).asReadonly() } },
        { provide: SeriesEntryStore, useValue: { selectedEntries: seriesEntries.asReadonly(), loading: signal(false).asReadonly() } },
        { provide: EntryService, useValue: { enterRaces, swapAndEnter, findEntryConflicts } },
        { provide: DialogsService, useValue: { promptEntryConflict } },
        { provide: ClubStore, useValue: { club: signal({ classes: [] }).asReadonly() } },
        { provide: RaceCalendarStore, useValue: { allRaces: () => [race] } },
        { provide: MatDialog, useValue: { open: dialogOpen } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate } },
      ],
    });

    store = TestBed.inject(ScanReviewStore);
    scanRun = TestBed.inject(ScanRunStore) as unknown as FakeScanRunStore;
    applyRowMatch = scanRun.applyRowMatch;
  });

  function stageFromSeriesEntries(): void {
    seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555'), seriesEntry('e-6666', 'Drew', '6666')]);
    scanRun.setScanResult(stagingScan);
  }

  function pendingHelms(): (string | undefined)[] {
    return store.matchedRows().filter(vm => vm.pending).map(vm => vm.identity?.helm);
  }

  it('saves results, clears the stored scan, then navigates', async () => {
    await store.save();

    expect(recordResult).toHaveBeenCalledTimes(1);
    expect(recordResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: COMPETITOR_ID }),
      expect.anything(),
      expect.objectContaining({ scoringSheetRow: 1 }),
    );
    expect(clearScanResponse).toHaveBeenCalledWith(RACE_ID);
    expect(navigate).toHaveBeenCalledWith(['/results-input/manual'], { queryParams: { raceId: RACE_ID } });
    expect(clearScanResponse.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
    expect(store.error()).toBeNull();
    expect(store.saving()).toBe(false);
  });

  it('shows an error and preserves the scan when recordResult throws', async () => {
    recordResult.mockRejectedValue(new Error('Firestore write failed'));

    await store.save();

    expect(consoleError).toHaveBeenCalledWith('ScanReviewStore.save: save failed', expect.any(Error));
    expect(store.error()).toBe('Firestore write failed');
    expect(navigate).not.toHaveBeenCalled();
    expect(clearScanResponse).not.toHaveBeenCalled();
    expect(store.saving()).toBe(false);
  });

  it('lists only unlinked race competitors for Link', () => {
    expect(store.linkableCompetitors().map(c => c.id)).toEqual([UNLINKED_ID]);
    expect(store.canLink()).toBe(true);
  });

  it('linkScanRow applies matchedCompetitorId via applyRowMatch', async () => {
    dialogOpen.mockReturnValue({ afterClosed: () => of({ competitorId: UNLINKED_ID }) });
    const unmatched: ScannedResultRow = scanResponse.scannedResults[1];

    await store.linkScanRow(unmatched);

    expect(dialogOpen).toHaveBeenCalled();
    expect(applyRowMatch).toHaveBeenCalledWith(2, UNLINKED_ID);
  });

  it('derives unique series-entry matches without writing anything', () => {
    stageFromSeriesEntries();

    expect(pendingHelms()).toEqual(['Casey', 'Drew']);
    expect(store.unmatchedRows()).toEqual([]);
    expect(enterRaces).not.toHaveBeenCalled();
    expect(scanRun.stageRowEntry).not.toHaveBeenCalled();
    expect(scanRun.row(3)?.pendingEntry).toBeUndefined();
  });

  it('does not match automatically when the entry conflicts with a race entry', () => {
    findEntryConflicts.mockReturnValue([{ reason: 'sameHelmDifferentHull' }]);

    stageFromSeriesEntries();

    expect(pendingHelms()).toEqual([]);
    expect(store.unmatchedRows().map(vm => vm.row.rowIndex)).toEqual([3, 4]);
  });

  it('re-derives the match when the sail number changes', () => {
    seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555'), seriesEntry('e-6666', 'Drew', '6666')]);
    scanRun.setScanResult({ unreadableRowsCount: 0, scannedResults: [unmatchedRow(3, '5555')] });
    expect(pendingHelms()).toEqual(['Casey']);

    scanRun.setScanResult({ unreadableRowsCount: 0, scannedResults: [unmatchedRow(3, '6666')] });

    expect(pendingHelms()).toEqual(['Drew']);
  });

  it('matches only the first of two rows with the same boat', () => {
    seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
    scanRun.setScanResult({
      unreadableRowsCount: 0,
      scannedResults: [unmatchedRow(3, '5555'), unmatchedRow(4, '5555')],
    });

    expect(store.matchedRows().filter(vm => vm.pending).map(vm => vm.row.rowIndex)).toEqual([3]);
    expect(store.unmatchedRows().map(vm => vm.row.rowIndex)).toEqual([4]);
  });

  it('keeps the scan acceptance for automatic matches', () => {
    seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
    scanRun.setScanResult({
      unreadableRowsCount: 0,
      scannedResults: [{ ...unmatchedRow(3, '5555'), accepted: false }],
    });

    expect(store.matchedRows().map(vm => vm.row.accepted)).toEqual([false]);
  });

  it('creates entries for accepted staged rows on save, then records their results', async () => {
    stageFromSeriesEntries();

    await store.save();

    expect(enterRaces).toHaveBeenCalledTimes(2);
    expect(enterRaces).toHaveBeenCalledWith(expect.objectContaining({ helm: 'Casey', races: [race] }));
    expect(applyRowMatch).toHaveBeenCalledWith(3, 'new-1');
    expect(applyRowMatch).toHaveBeenCalledWith(4, 'new-2');
    expect(recordResult).toHaveBeenCalledTimes(3);
    expect(recordResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-1' }),
      race,
      expect.objectContaining({ scoringSheetRow: 3 }),
    );
    const lastCreate = Math.max(...enterRaces.mock.invocationCallOrder);
    expect(lastCreate).toBeLessThan(Math.min(...recordResult.mock.invocationCallOrder));
    expect(navigate).toHaveBeenCalled();
  });

  it('creates nothing for a staged row that is not accepted', async () => {
    stageFromSeriesEntries();
    store.setAcceptance({ rowIndex: 3, accepted: false });
    store.setAcceptance({ rowIndex: 4, accepted: false });

    await store.save();

    expect(enterRaces).not.toHaveBeenCalled();
    expect(recordResult).toHaveBeenCalledTimes(1);
    expect(recordResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: COMPETITOR_ID }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('keeps rows created before a failure linked and saves no results', async () => {
    stageFromSeriesEntries();
    enterRaces.mockImplementationOnce(async (details: EntryDetails) => [
      new RaceCompetitor({ id: 'new-1', raceId: details.races[0].id, seriesId: 's1', seriesEntryId: 'e-new-1' }),
    ]);
    enterRaces.mockRejectedValueOnce(new Error('Firestore write failed'));

    await store.save();

    expect(scanRun.row(3)?.matchedCompetitorId).toBe('new-1');
    expect(pendingHelms()).toEqual(['Drew']);
    expect(recordResult).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(store.error()).toBe('Firestore write failed');
  });

  it('refuses to save a chosen entry that now conflicts without the user agreeing to swap', async () => {
    seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
    const uncertainSail = { ...unmatchedRow(3, '5555'), sailNumber: { value: '5555', confidence: 'MANUAL_CHECK' as const } };
    scanRun.setScanResult({ unreadableRowsCount: 0, scannedResults: [uncertainSail] });
    await store.resolveUnmatched(store.unmatchedRows()[0].row);
    expect(pendingHelms()).toEqual(['Casey']);
    findEntryConflicts.mockReturnValue([{ reason: 'sameEntry' }]);

    await store.save();

    expect(enterRaces).not.toHaveBeenCalled();
    expect(recordResult).not.toHaveBeenCalled();
    expect(store.error()).toContain('Row 3');
  });

  it('undo returns an automatic match to the unmatched table without matching it again', () => {
    stageFromSeriesEntries();

    store.unstageRow(scanRun.row(3)!);

    expect(pendingHelms()).toEqual(['Drew']);
    expect(store.unmatchedRows().map(vm => vm.row.rowIndex)).toEqual([3]);
    expect(store.unmatchedRows()[0].planKind).toBe('sign-on-entry');
  });

  it('blocks choosing an entry another row already uses', async () => {
    seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
    scanRun.setScanResult({
      unreadableRowsCount: 0,
      scannedResults: [unmatchedRow(3, '5555'), unmatchedRow(4, '5555')],
    });

    await store.resolveUnmatched(store.unmatchedRows()[0].row);

    expect(scanRun.stageRowEntry).not.toHaveBeenCalled();
    expect(pendingHelms()).toEqual(['Casey']);
  });

  it('stages a new entry from the Enter dialog and swaps conflicts on save when agreed', async () => {
    const conflict = {
      race,
      reason: 'sameHelmDifferentHull',
      existingEntry: seriesEntry('e-old', 'Eli', '1111'),
    };
    scanRun.setScanResult({ unreadableRowsCount: 0, scannedResults: [unmatchedRow(5, '7777')] });
    findEntryConflicts.mockReturnValue([conflict]);
    dialogOpen.mockReturnValue({ afterClosed: () => of({ helm: 'Eli', crew: 'Fran' }) });

    await store.enterUnmatched(scanRun.row(5)!);

    expect(promptEntryConflict).toHaveBeenCalled();
    expect(enterRaces).not.toHaveBeenCalled();
    expect(scanRun.row(5)?.pendingEntry).toEqual(
      expect.objectContaining({ helm: 'Eli', crew: 'Fran', sailNumber: '7777', swapConflicts: true }),
    );

    await store.save();

    expect(swapAndEnter).toHaveBeenCalledWith(expect.objectContaining({ helm: 'Eli' }), [conflict]);
    expect(recordResult).toHaveBeenCalledTimes(1);
  });
});
