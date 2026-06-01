import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FirebaseApp } from '@angular/fire/app';
import { Firestore } from '@angular/fire/firestore';
import { CaptureSessionUploadService } from 'app/results-sheet-phone-capture/capture-session-upload.service';
import { ScannerOrchestrationService } from './scanner-orchestration.service';
import { ScanRunState } from './scan-model';

describe('ScannerOrchestrationService', () => {
  let service: ScannerOrchestrationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ScannerOrchestrationService,
        { provide: FirebaseApp, useValue: {} },
        { provide: Firestore, useValue: {} },
        {
          provide: CaptureSessionUploadService,
          useValue: { uploadFromCaptureSession: vi.fn() },
        },
      ],
    });
    service = TestBed.inject(ScannerOrchestrationService);
  });

  it('returns error state when scan is missing image', async () => {
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
    }).subscribe(s => states.push(s));

    await vi.advanceTimersByTimeAsync(0);
    expect(states.some(s => s.status === 'error')).toBe(true);
    vi.useRealTimers();
  });
});
