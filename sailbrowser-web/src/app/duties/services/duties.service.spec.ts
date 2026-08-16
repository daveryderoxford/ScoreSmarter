import { TestBed } from '@angular/core/testing';
import { FirebaseApp } from '@angular/fire/app';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaceDay, RaceDayDutyMember } from '@shared/race-day';
import { ClubTenant, FirestoreTenantService } from 'app/club-tenant';
import {
  DUTY_REGISTER_CLUB_ID,
  DutiesService,
  RACE_DAY_DOC_DATA,
  RACE_DAY_SET_DOC,
} from './duties.service';

const sampleMember: RaceDayDutyMember = {
  role: 'duty race officer',
  name: 'David RYDER',
  status: 'not-attending',
  key: '89744d04299c8b1c4b58d786776d80',
};

const sampleRaceDay: RaceDay = {
  date: '2026-08-14',
  dutyTeam: [sampleMember],
};

const { ensureRaceDay } = vi.hoisted(() => ({
  ensureRaceDay: vi.fn(),
}));

const raceDaySetDoc = vi.fn(async () => undefined);

vi.mock('@angular/fire/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn((_functions, name: string) => {
    if (name === 'ensureRaceDay') return ensureRaceDay;
    throw new Error(`Unexpected callable: ${name}`);
  }),
}));

async function waitForDutiesLoaded(service: DutiesService): Promise<void> {
  await vi.waitFor(() => {
    expect(service.loading()).toBe(false);
  });
}

describe('DutiesService', () => {
  let service: DutiesService;
  let docRef: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    ensureRaceDay.mockResolvedValue({ data: { date: '2026-08-14', created: true } });
    raceDaySetDoc.mockResolvedValue(undefined);
    docRef = vi.fn(() => ({ path: 'clubs/ibrsc/race-days/2026-08-14' }));

    TestBed.configureTestingModule({
      providers: [
        DutiesService,
        { provide: FirebaseApp, useValue: {} },
        { provide: ClubTenant, useValue: { clubId: DUTY_REGISTER_CLUB_ID } },
        { provide: FirestoreTenantService, useValue: { docRef } },
        { provide: RACE_DAY_DOC_DATA, useValue: () => of(sampleRaceDay) },
        { provide: RACE_DAY_SET_DOC, useValue: raceDaySetDoc },
      ],
    });
    service = TestBed.inject(DutiesService);
    service.setRequestedDate('2026-08-14');
  });

  it('listens for the duty team without calling ensure when the doc exists', async () => {
    await waitForDutiesLoaded(service);

    expect(ensureRaceDay).not.toHaveBeenCalled();
    expect(service.duties()).toEqual([sampleMember]);
    expect(service.error()).toBeNull();
  });

  it('calls ensureRaceDay when the race-day doc is missing', async () => {
    TestBed.resetTestingModule();
    const doc$ = new BehaviorSubject<RaceDay | undefined>(undefined);
    ensureRaceDay.mockImplementation(async () => {
      doc$.next(sampleRaceDay);
      return { data: { date: '2026-08-14', created: true } };
    });
    docRef = vi.fn(() => ({ path: 'clubs/ibrsc/race-days/2026-08-14' }));

    TestBed.configureTestingModule({
      providers: [
        DutiesService,
        { provide: FirebaseApp, useValue: {} },
        { provide: ClubTenant, useValue: { clubId: DUTY_REGISTER_CLUB_ID } },
        { provide: FirestoreTenantService, useValue: { docRef } },
        { provide: RACE_DAY_DOC_DATA, useValue: () => doc$.asObservable() },
        { provide: RACE_DAY_SET_DOC, useValue: raceDaySetDoc },
      ],
    });
    service = TestBed.inject(DutiesService);
    service.setRequestedDate('2026-08-14');

    await vi.waitFor(() => {
      expect(ensureRaceDay).toHaveBeenCalledWith({
        clubId: DUTY_REGISTER_CLUB_ID,
        date: '2026-08-14',
      });
    });
    await waitForDutiesLoaded(service);
    expect(service.duties()).toEqual([sampleMember]);
  });

  it('calls ensureRaceDay even when Firestore Listen never emits', async () => {
    TestBed.resetTestingModule();
    // Never emits — simulates blocked/offline Listen stream stuck in loading.
    const hung$ = new Observable<RaceDay | undefined>(() => undefined);
    ensureRaceDay.mockResolvedValue({ data: { date: '2026-08-14', created: true } });
    docRef = vi.fn(() => ({ path: 'clubs/ibrsc/race-days/2026-08-14' }));

    TestBed.configureTestingModule({
      providers: [
        DutiesService,
        { provide: FirebaseApp, useValue: {} },
        { provide: ClubTenant, useValue: { clubId: DUTY_REGISTER_CLUB_ID } },
        { provide: FirestoreTenantService, useValue: { docRef } },
        { provide: RACE_DAY_DOC_DATA, useValue: () => hung$ },
        { provide: RACE_DAY_SET_DOC, useValue: raceDaySetDoc },
      ],
    });
    service = TestBed.inject(DutiesService);
    service.setRequestedDate('2026-08-14');

    await vi.waitFor(() => {
      expect(ensureRaceDay).toHaveBeenCalledWith({
        clubId: DUTY_REGISTER_CLUB_ID,
        date: '2026-08-14',
      });
    });
    await waitForDutiesLoaded(service);
    expect(service.error()).toBeNull();
  });

  it('does not fetch duties for other clubs', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DutiesService,
        { provide: FirebaseApp, useValue: {} },
        { provide: ClubTenant, useValue: { clubId: 'test' } },
        { provide: FirestoreTenantService, useValue: { docRef: vi.fn(() => ({})) } },
        { provide: RACE_DAY_DOC_DATA, useValue: () => of(sampleRaceDay) },
        { provide: RACE_DAY_SET_DOC, useValue: raceDaySetDoc },
      ],
    });
    service = TestBed.inject(DutiesService);

    await waitForDutiesLoaded(service);

    expect(ensureRaceDay).not.toHaveBeenCalled();
    expect(service.duties()).toEqual([]);
  });

  it('sets an error when ensure fails for a missing doc', async () => {
    TestBed.resetTestingModule();
    ensureRaceDay.mockRejectedValue(new Error('Network down'));
    TestBed.configureTestingModule({
      providers: [
        DutiesService,
        { provide: FirebaseApp, useValue: {} },
        { provide: ClubTenant, useValue: { clubId: DUTY_REGISTER_CLUB_ID } },
        { provide: FirestoreTenantService, useValue: { docRef } },
        { provide: RACE_DAY_DOC_DATA, useValue: () => of(undefined) },
        { provide: RACE_DAY_SET_DOC, useValue: raceDaySetDoc },
      ],
    });
    service = TestBed.inject(DutiesService);
    service.setRequestedDate('2026-08-14');

    await vi.waitFor(() => {
      expect(service.error()).toBe('Network down');
    });
    expect(service.duties()).toEqual([]);
  });

  it('writes status to Firestore and waits for the write', async () => {
    await waitForDutiesLoaded(service);

    const ok = await service.setStatus(sampleMember, 'attending');

    expect(ok).toBe(true);
    expect(docRef).toHaveBeenCalledWith('race-days', '2026-08-14');
    expect(raceDaySetDoc).toHaveBeenCalledWith(
      { path: 'clubs/ibrsc/race-days/2026-08-14' },
      {
        dutyTeam: [{ ...sampleMember, status: 'attending' }],
      },
    );
  });

  it('sets an error when the Firestore write fails', async () => {
    await waitForDutiesLoaded(service);
    raceDaySetDoc.mockRejectedValue(new Error('Update failed'));

    const ok = await service.setStatus(sampleMember, 'confirmed');

    expect(ok).toBe(false);
    expect(service.error()).toBe('Update failed');
  });
});
