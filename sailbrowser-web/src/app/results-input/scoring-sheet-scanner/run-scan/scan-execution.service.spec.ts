import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FirebaseApp } from '@angular/fire/app';
import { ScanExecutionService } from './scan-execution.service';
import { ScanRunState } from '../model/scan-model';

describe('ScanExecutionService', () => {
  let service: ScanExecutionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ScanExecutionService,
        { provide: FirebaseApp, useValue: {} },
      ],
    });
    service = TestBed.inject(ScanExecutionService);
  });

  it('returns error state when scan is missing image', async () => {
    vi.useFakeTimers();
    const states: ScanRunState[] = [];
    service.runScan({
      raceId: 'race-1',
      clubId: 'club-1',
      scannerContext: {
        targetRaces: [],
        defaultHour: 14,
        defaultLaps: 3,
        listOrder: 'chronological',
        classAliases: {},
        roster: [],
        lapsPresentOnSheet: true,
        timeFormat: 'clock_hms',
      },
    }).subscribe(s => states.push(s));

    await vi.advanceTimersByTimeAsync(0);
    expect(states.some(s => s.status === 'error')).toBe(true);
    vi.useRealTimers();
  });
});
