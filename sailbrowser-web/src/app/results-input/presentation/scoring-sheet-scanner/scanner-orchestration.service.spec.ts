import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { FirebaseApp } from '@angular/fire/app';
import { RaceCalendarStore } from 'app/race-calender';
import { RaceCompetitor } from '../../model/race-competitor';
import { RaceCompetitorStore } from '../../services/race-competitor-store';
import { SeriesEntryStore } from '../../services/series-entry-store';
import { ScannerOrchestrationService } from './scanner-orchestration.service';
import { ScanRunState } from './scan-model';

describe('ScannerOrchestrationService', () => {
  let service: ScannerOrchestrationService;

  const race = {
    id: 'race-1',
    seriesName: 'Series',
    fleetId: 'fleet-1',
    index: 1,
    seriesId: 'series-1',
    scheduledStart: new Date('2026-01-01T14:00:00Z'),
    raceOfDay: 1,
    actualStart: new Date('2026-01-01T14:00:00Z'),
    timeInputMode: 'tod' as const,
    type: 'Handicap' as const,
    status: 'Future' as const,
    isDiscardable: true,
    isAverageLap: false,
    dirty: false,
    resultsSheetImage: '',
  };

  const competitor = new RaceCompetitor({
    id: 'comp-1',
    raceId: 'race-1',
    seriesId: 'series-1',
    seriesEntryId: 'entry-1',
    resultCode: 'NOT FINISHED',
    manualLaps: 0,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ScannerOrchestrationService,
        { provide: FirebaseApp, useValue: {} },
        { provide: RaceCalendarStore, useValue: { allRaces: signal([race]).asReadonly() } },
        { provide: RaceCompetitorStore, useValue: { selectedCompetitors: signal([competitor]).asReadonly() } },
        {
          provide: SeriesEntryStore,
          useValue: {
            selectedEntries: signal([{
              id: 'entry-1',
              seriesId: 'series-1',
              helm: 'Alex',
              boatClass: 'ILCA 7',
              sailNumber: 1234,
              handicaps: [],
            }]).asReadonly(),
          },
        },
      ],
    });
    service = TestBed.inject(ScannerOrchestrationService);
  });

  it('emits progress then success in mock mode', async () => {
    vi.useFakeTimers();
    const states: ScanRunState[] = [];
    service.runScan({
      raceId: 'race-1',
      clubId: 'club-1',
      scannerContext: {
        targetRaces: [],
        lapFormat: 'numbers',
        defaultHour: 14,
        defaultLaps: 3,
        hasHours: true,
        listOrder: 'chronological',
        classAliases: {},
        roster: [],
        lapsPresentOnSheet: true,
        timeFormat: 'clock_hms',
      },
      mockMode: true,
    }).subscribe(s => states.push(s));

    expect(states[0].status).toBe('running');
    await vi.advanceTimersByTimeAsync(5000);
    expect(states.some(s => s.status === 'running' && !!s.stageMessage)).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(states.some(s => s.status === 'success' && !!s.result)).toBe(true);
    vi.useRealTimers();
  });

  it('generates mock rows linked to real race competitors', () => {
    const response = service.buildMockResponse('race-1');
    const matched = response.scannedResults.find(r => r.matchedCompetitorId === 'comp-1');
    expect(matched).toBeDefined();
    expect(matched?.boatClass?.value).toBe('ILCA 7');
    expect(matched?.sailNumber?.value).toBe('1234');
  });

  it('returns error state when real scan is missing image', async () => {
    vi.useFakeTimers();
    const states: ScanRunState[] = [];
    service.runScan({
      raceId: 'race-1',
      clubId: 'club-1',
      scannerContext: {
        targetRaces: [],
        lapFormat: 'numbers',
        defaultHour: 14,
        defaultLaps: 3,
        hasHours: true,
        listOrder: 'chronological',
        classAliases: {},
        roster: [],
        lapsPresentOnSheet: true,
        timeFormat: 'clock_hms',
      },
      mockMode: false,
    }).subscribe(s => states.push(s));

    await vi.advanceTimersByTimeAsync(0);
    expect(states.some(s => s.status === 'error')).toBe(true);
    vi.useRealTimers();
  });
});
