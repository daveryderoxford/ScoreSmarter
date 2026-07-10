import { computed, Injectable, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoatsStore } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { Race } from 'app/race-calender/model/race';
import { RaceCompetitor } from '../../model/race-competitor';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { SeriesEntry } from '../../model/series-entry';
import { ManualResultsService } from '../../services/manual-results.service';
import { RaceCompetitorReader } from '../../services/race-competitor-reader';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import type { ScannerTimeFormat } from '@shared/scanner-context';
import { ScanResponse } from '../model/scan-model';
import { ScanSelectedRace } from '../select-race/race-selection.store';
import { ScanRunStore } from '../run-scan/scan-run.store';
import { ScanPersistenceService } from '../shared/scan-persistence.service';
import { ScanReviewStore } from './scan-review.store';
import { ScanRowMatchingService } from './scan-row-matching.service';

const RACE_ID = 'r1';
const COMPETITOR_ID = 'c1';

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
  ],
};

function resolvedCompetitor(): ResolvedRaceCompetitor {
  return new ResolvedRaceCompetitor(
    { id: COMPETITOR_ID, raceId: RACE_ID, seriesEntryId: 'e1', resultCode: 'NOT FINISHED' } as RaceCompetitor,
    {
      id: 'e1',
      seriesId: 's1',
      helm: 'Alex',
      boatClass: 'ILCA 7',
      sailNumber: '1234',
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
    scanStrategy: this.fb.nonNullable.control('FullAIScan' as const, Validators.required),
  });
  private readonly _scanResult = signal<ScanResponse | null>(scanResponse);
  readonly scanResult = this._scanResult.asReadonly();
  defaultHourForParsing(): number {
    return 14;
  }
}

@Injectable()
class FakeRaceSelectionStore {
  readonly selectedRaceId = signal(RACE_ID).asReadonly();
  readonly selectedRace = computed(() => race);
  select = vi.fn();
}

@Injectable()
class FakeRaceCompetitorReader {
  readonly selectedResolvedCompetitors = signal([resolvedCompetitor()]).asReadonly();
}

@Injectable()
class FakeRaceCompetitorStore {
  readonly selectedCompetitors = signal([
    { id: COMPETITOR_ID, raceId: RACE_ID, seriesEntryId: 'e1', resultCode: 'NOT FINISHED' },
  ] as RaceCompetitor[]).asReadonly();
}

describe('ScanReviewStore.save', () => {
  let store: ScanReviewStore;
  let recordResult: ReturnType<typeof vi.fn>;
  let clearScanResponse: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    recordResult = vi.fn().mockResolvedValue(undefined);
    clearScanResponse = vi.fn().mockResolvedValue(undefined);
    navigate = vi.fn().mockResolvedValue(true);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* empty */ });

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
        { provide: BoatsStore, useValue: { boats: signal([]).asReadonly() } },
        { provide: ClubStore, useValue: { club: signal({ classes: [] }).asReadonly() } },
        { provide: MatDialog, useValue: {} },
        { provide: Router, useValue: { navigate } },
      ],
    });

    store = TestBed.inject(ScanReviewStore);
  });

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
});
