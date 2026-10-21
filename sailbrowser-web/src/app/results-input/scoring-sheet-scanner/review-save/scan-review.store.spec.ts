import { computed, Injectable, signal, WritableSignal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { BoatsStore } from 'app/boats';
import { Boat } from 'app/boats/model/boat';
import { EntryDetails, EntryService } from 'app/entry/services/entry.service';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { RaceCompetitor } from '../../model/race-competitor';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { SeriesEntry } from '../../model/series-entry';
import { ManualResultsService } from '../../services/manual-results.service';
import { RaceCompetitorMutator } from '../../services/race-competitor-mutator';
import { RaceCompetitorReader } from '../../services/race-competitor-reader';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { SeriesEntryStore } from '../../services/series-entry-store';
import type { ScannerTimeFormat } from '@shared/scanner-context';
import { PendingScanEntry, ScanResponse, ScannedResultRow } from '../model/scan-model';
import { ScanSelectedRace } from '../select-race/race-selection.store';
import { replaceRowIdentity } from '../run-scan/promote-scanned-alternative';
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

/** Row 1 is linked to race entry c1; row 2 is unreadable. Race entry c2 is not on the sheet. */
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
  editRowIdentity = vi.fn((rowIndex: number, identity: { boatClass: string; sailNumber: string }) => {
    this.updateRow(rowIndex, row => replaceRowIdentity(row, identity));
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

function boat(id: string, helm: string, sailNumber: string): Boat {
  return { id, helm, sailNumber, boatClass: 'ILCA 7', name: '', crew: '', isClub: false };
}

function scannedRow(rowIndex: number, sailNumber: string, helm?: string): ScannedResultRow {
  return {
    rowIndex,
    overallRowConfidence: 'HIGH',
    accepted: true,
    sailNumber: { value: sailNumber, confidence: 'HIGH' },
    boatClass: { value: 'ILCA 7', confidence: 'HIGH' },
    ...(helm ? { competitorName: { value: helm, confidence: 'HIGH' as const } } : {}),
    time: { value: '14:55:00', confidence: 'HIGH' },
    laps: { value: 3, confidence: 'HIGH' },
    status: 'OK',
  };
}

function scanOf(...rows: ScannedResultRow[]): ScanResponse {
  return { unreadableRowsCount: 0, scannedResults: rows };
}

/** Row 1 is already linked; rows 3 and 4 match series entries but have no race competitor. */
const stagingScan = scanOf(scanResponse.scannedResults[0], scannedRow(3, '5555'), scannedRow(4, '6666'));

describe('ScanReviewStore', () => {
  let store: ScanReviewStore;
  let scanRun: FakeScanRunStore;
  let recordResult: ReturnType<typeof vi.fn>;
  let deleteRaceCompetitor: ReturnType<typeof vi.fn>;
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
  let boats: WritableSignal<Boat[]>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    recordResult = vi.fn().mockResolvedValue(undefined);
    deleteRaceCompetitor = vi.fn().mockResolvedValue(undefined);
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
    boats = signal<Boat[]>([]);

    TestBed.configureTestingModule({
      providers: [
        ScanReviewStore,
        ScanRowMatchingService,
        { provide: ScanRunStore, useClass: FakeScanRunStore },
        { provide: ScanSelectedRace, useClass: FakeRaceSelectionStore },
        { provide: RaceCompetitorReader, useClass: FakeRaceCompetitorReader },
        { provide: RaceCompetitorStore, useClass: FakeRaceCompetitorStore },
        { provide: RaceCompetitorMutator, useValue: { deleteRaceCompetitor } },
        { provide: ManualResultsService, useValue: { recordResult } },
        { provide: ScanPersistenceService, useValue: { clearScanResponse } },
        { provide: BoatsStore, useValue: { boats: boats.asReadonly(), isLoading: signal(false).asReadonly() } },
        { provide: SeriesEntryStore, useValue: { selectedEntries: seriesEntries.asReadonly(), loading: signal(false).asReadonly() } },
        { provide: EntryService, useValue: { enterRaces, swapAndEnter, findEntryConflicts } },
        { provide: DialogsService, useValue: { promptEntryConflict } },
        { provide: ClubStore, useValue: { club: signal({ classes: [{ name: 'ILCA 7' }] }).asReadonly() } },
        { provide: RaceCalendarStore, useValue: { allRaces: () => [race] } },
        { provide: MatDialog, useValue: { open: dialogOpen } },
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

  function statuses(): [number, string][] {
    return store.gridRows().map(vm => [vm.row.rowIndex, vm.status]);
  }

  function gridRow(rowIndex: number) {
    return store.gridRows().find(vm => vm.row.rowIndex === rowIndex)!;
  }

  function stagedHelms(): (string | undefined)[] {
    return store.gridRows().filter(vm => vm.pendingSource).map(vm => vm.identity?.helm);
  }

  function existingEntryConflict() {
    return { race, reason: 'sameHelmDifferentHull', existingEntry: seriesEntry('e-old', 'Eli', '1111') };
  }

  describe('grid', () => {
    it('shows every row in sheet order with its status', () => {
      scanRun.setScanResult(scanOf(scannedRow(3, '5555'), ...scanResponse.scannedResults));
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);

      expect(statuses()).toEqual([[1, 'matched'], [2, 'no-match'], [3, 'new-entry']]);
      expect(gridRow(2).problem).toEqual({ field: 'boatClass', message: 'Class unreadable' });
    });

    it('derives unique matches without writing anything', () => {
      stageFromSeriesEntries();

      expect(stagedHelms()).toEqual(['Casey', 'Drew']);
      expect(enterRaces).not.toHaveBeenCalled();
      expect(scanRun.stageRowEntry).not.toHaveBeenCalled();
      expect(scanRun.row(3)?.pendingEntry).toBeUndefined();
    });

    it('re-derives the match when the sail number changes', () => {
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555'), seriesEntry('e-6666', 'Drew', '6666')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '5555')));
      expect(stagedHelms()).toEqual(['Casey']);

      scanRun.setScanResult(scanOf(scannedRow(3, '6666')));

      expect(stagedHelms()).toEqual(['Drew']);
    });

    it('keeps the scan acceptance for automatic matches', () => {
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
      scanRun.setScanResult(scanOf({ ...scannedRow(3, '5555'), accepted: false }));

      expect(gridRow(3)).toMatchObject({ status: 'new-entry', canAccept: true });
      expect(gridRow(3).row.accepted).toBe(false);
    });

    it('uses the scanned helm to pick between series entries and boats', () => {
      seriesEntries.set([seriesEntry('e-5555', 'Alex Smith', '5555')]);
      boats.set([boat('b1', 'Casey Jones', '5555')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '5555', 'C Jones')));

      expect(gridRow(3)).toMatchObject({ status: 'new-entry', pendingSource: 'boat' });
      expect(gridRow(3).identity?.helm).toBe('Casey Jones');
    });

    it('uses the only helm for the boat whatever helm was scanned', () => {
      boats.set([boat('b1', 'Jane Doe', '5555')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '5555', 'J Do')));

      expect(gridRow(3)).toMatchObject({ status: 'new-entry', pendingSource: 'boat', helmOptions: [] });
      expect(gridRow(3).identity?.helm).toBe('Jane Doe');
    });

    it('asks for a helm when the scanned helm is not one of several candidates', () => {
      boats.set([boat('b1', 'Jane Doe', '5555'), boat('b2', 'Sam Smith', '5555')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '5555', 'Bob Brown')));

      expect(gridRow(3)).toMatchObject({ status: 'choose-helm', canAccept: false });
      expect(gridRow(3).helmOptions.map(o => o.value))
        .toEqual(['candidate:Jane Doe', 'candidate:Sam Smith', 'new:Bob Brown', 'edit']);
      expect(store.acceptedMatchedCount()).toBe(0);
    });

    it('keeps the rows that needed attention visible after they are fixed', () => {
      store.setNeedsAttentionOnly(true);
      expect(store.visibleRows().map(vm => vm.row.rowIndex)).toEqual([2]);

      scanRun.applyRowMatch(2, UNLINKED_ID);

      expect(store.visibleRows().map(vm => [vm.row.rowIndex, vm.status])).toEqual([[2, 'matched']]);
      store.setNeedsAttentionOnly(false);
      expect(store.visibleRows()).toHaveLength(2);
    });

    it('counts rows by status', () => {
      stageFromSeriesEntries();
      expect(store.summary()).toEqual({ matched: 1, newEntries: 2, chooseHelm: 0, noMatch: 0, conflicts: 0 });
    });
  });

  describe('conflicts', () => {
    it('flags the same boat in two accepted rows, and clears it when one is unticked', () => {
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '5555'), scannedRow(20, '5555')));

      expect(statuses()).toEqual([[3, 'conflict'], [20, 'conflict']]);
      expect(gridRow(3).reason).toBe('Same boat as row 20');

      store.setAcceptance({ rowIndex: 3, accepted: false });

      expect(statuses()).toEqual([[3, 'new-entry'], [20, 'new-entry']]);
    });

    it('flags two accepted rows linked to the same race entry', () => {
      scanRun.setScanResult(scanOf(scannedRow(3, '1234'), scannedRow(20, '1234')));

      expect(statuses()).toEqual([[3, 'conflict'], [20, 'conflict']]);
    });

    it('refuses to save while an accepted row conflicts', async () => {
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '5555'), scannedRow(20, '5555')));

      await store.save();

      expect(store.error()).toContain('Row 3: Same boat as row 20');
      expect(enterRaces).not.toHaveBeenCalled();
      expect(recordResult).not.toHaveBeenCalled();
    });

    it('flags a clash with an existing race entry only on accepted rows', () => {
      findEntryConflicts.mockReturnValue([existingEntryConflict()]);
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '5555'), { ...scannedRow(4, '5555'), accepted: false }));

      expect(gridRow(3)).toMatchObject({ status: 'conflict', canReplaceExisting: true });
      expect(gridRow(3).reason).toContain('Already entered in this race');
      expect(gridRow(4).status).toBe('new-entry');
    });

    it('replaces the existing entry on save once the user agrees', async () => {
      const conflict = existingEntryConflict();
      findEntryConflicts.mockReturnValue([conflict]);
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '5555')));

      await store.replaceExisting(gridRow(3).row);

      expect(promptEntryConflict).toHaveBeenCalled();
      expect(gridRow(3).status).toBe('new-entry');

      await store.save();

      expect(swapAndEnter).toHaveBeenCalledWith(expect.objectContaining({ helm: 'Casey' }), [conflict]);
      expect(recordResult).toHaveBeenCalledTimes(1);
    });
  });

  describe('choosing a helm', () => {
    beforeEach(() => {
      seriesEntries.set([seriesEntry('e-a', 'Alex', '5555'), seriesEntry('e-b', 'Blake', '5555')]);
      scanRun.setScanResult(scanOf({ ...scannedRow(3, '5555'), accepted: false }));
    });

    it('stages the chosen candidate and accepts the row', async () => {
      expect(gridRow(3).status).toBe('choose-helm');

      await store.chooseHelm(gridRow(3).row, 'candidate:Blake');

      expect(gridRow(3)).toMatchObject({ status: 'new-entry', pendingSource: 'series-entry', selectedHelm: 'candidate:Blake' });
      expect(gridRow(3).row.accepted).toBe(true);
    });

    it('stages a new helm with the boat details', async () => {
      await store.chooseHelm(gridRow(3).row, 'new:Bob');

      expect(scanRun.row(3)?.pendingEntry).toEqual(
        expect.objectContaining({ helm: 'Bob', boatClass: 'ILCA 7', sailNumber: '5555', divisions: [] }),
      );
      expect(gridRow(3).pendingSource).toBe('new');
    });

    it('does nothing when the user cancels the conflict prompt', async () => {
      findEntryConflicts.mockReturnValue([existingEntryConflict()]);
      promptEntryConflict.mockResolvedValue('cancel');

      await store.chooseHelm(gridRow(3).row, 'candidate:Alex');

      expect(scanRun.stageRowEntry).not.toHaveBeenCalled();
    });
  });

  describe('editing a row', () => {
    function editTo(result: object): Promise<void> {
      dialogOpen.mockReturnValue({ afterClosed: () => of(result) });
      return store.editRow(gridRow(2).row);
    }

    it('links the row when a race entry has the new class and sail number', async () => {
      await editTo({ boatClass: 'ILCA 7', sailNumber: '9999', helm: 'Blake' });

      expect(applyRowMatch).toHaveBeenCalledWith(2, UNLINKED_ID);
      expect(gridRow(2).status).toBe('matched');
      expect(scanRun.row(2)?.sailNumber).toMatchObject({ value: '9999', confidence: 'HIGH' });
    });

    it('stages the matching series entry', async () => {
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);

      await editTo({ boatClass: 'ILCA 7', sailNumber: '5555', helm: 'casey' });

      expect(scanRun.row(2)?.pendingEntry).toEqual(expect.objectContaining({ helm: 'Casey', sailNumber: '5555' }));
      expect(gridRow(2)).toMatchObject({ status: 'new-entry', pendingSource: 'series-entry' });
    });

    it('stages a new entry for a new boat', async () => {
      await editTo({ boatClass: 'ILCA 7', sailNumber: '7777', helm: 'Eli', crew: 'Fran' });

      expect(scanRun.row(2)?.pendingEntry).toEqual(
        expect.objectContaining({ helm: 'Eli', crew: 'Fran', boatClass: 'ILCA 7', sailNumber: '7777' }),
      );
      expect(gridRow(2)).toMatchObject({ status: 'new-entry', pendingSource: 'new' });
      expect(gridRow(2).row.accepted).toBe(true);
    });

    it('passes a lookup that reports what exists for a class and sail number', async () => {
      seriesEntries.set([seriesEntry('e-5555', 'Casey', '5555')]);
      await editTo(undefined as unknown as object);

      const { lookup } = dialogOpen.mock.calls[0][1].data;
      expect(lookup('ILCA 7', '9999')).toEqual({ enteredAs: 'Blake', candidates: [] });
      expect(lookup('ILCA 7', '5555')).toEqual({ candidates: [{ helm: 'Casey', source: 'series-entry' }] });
      expect(lookup('ILCA 7', '7777')).toEqual({ candidates: [] });
    });
  });

  describe('race entries not on the sheet', () => {
    it('lists race entries that no accepted row is linked to', () => {
      expect(store.notOnSheet().map(c => c.id)).toEqual([UNLINKED_ID]);

      store.setAcceptance({ rowIndex: 1, accepted: false });

      expect(store.notOnSheet().map(c => c.id)).toEqual([COMPETITOR_ID, UNLINKED_ID]);
    });

    it('marks every unchanged entry DNC', () => {
      store.setNotOnSheetAction(UNLINKED_ID, 'none');
      store.markAllNotOnSheetDnc();
      expect(store.notOnSheetAction(UNLINKED_ID)).toBe('DNC');
    });

    it('links an entry to a scanned row', () => {
      store.linkEntryToRow(UNLINKED_ID, 2);

      expect(applyRowMatch).toHaveBeenCalledWith(2, UNLINKED_ID);
      expect(store.notOnSheet()).toEqual([]);
    });

    it('suggests unmatched rows first, then the closest sail numbers', () => {
      seriesEntries.set([seriesEntry('e-9998', 'Casey', '9998')]);
      scanRun.setScanResult(scanOf(scannedRow(3, '9998'), scanResponse.scannedResults[1]));

      const suggestions = store.linkSuggestionsById().get(UNLINKED_ID)!;

      expect(suggestions.map(s => s.rowIndex)).toEqual([2, 3]);
      expect(gridRow(3).nearMissSail).toBe(true);
    });

    it('applies DNC, DNS and delete on save and leaves unchanged entries alone', async () => {
      scanRun.setScanResult(scanOf(scannedRow(5, '7777')));
      store.setNotOnSheetAction(COMPETITOR_ID, 'DNS');
      store.setNotOnSheetAction(UNLINKED_ID, 'delete');

      await store.save();

      expect(recordResult).toHaveBeenCalledWith(
        expect.objectContaining({ id: COMPETITOR_ID }),
        race,
        { finishTime: null, laps: 1, resultCode: 'DNS' },
      );
      expect(deleteRaceCompetitor).toHaveBeenCalledWith(expect.objectContaining({ id: UNLINKED_ID }));
      expect(navigate).toHaveBeenCalled();
    });

    it('can save only the not-on-sheet actions', async () => {
      store.setAcceptance({ rowIndex: 1, accepted: false });
      store.setNotOnSheetAction(UNLINKED_ID, 'DNC');

      expect(store.canSave()).toBe(true);
      await store.save();

      expect(recordResult).toHaveBeenCalledTimes(1);
      expect(recordResult).toHaveBeenCalledWith(
        expect.objectContaining({ id: UNLINKED_ID }),
        race,
        expect.objectContaining({ resultCode: 'DNC' }),
      );
    });
  });

  describe('save', () => {
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

    it('creates entries for accepted staged rows, then records their results', async () => {
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
      expect(scanRun.row(4)?.pendingEntry).toBeUndefined();
      expect(recordResult).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(store.error()).toBe('Firestore write failed');
    });
  });
});
