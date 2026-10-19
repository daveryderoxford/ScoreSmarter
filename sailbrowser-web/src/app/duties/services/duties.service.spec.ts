import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, type Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaceDay, RaceDayDutyMember } from '@shared/race-day';
import { FirestoreTenantService } from 'app/club-tenant';
import {
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

const raceDaySetDoc = vi.fn(async () => undefined);

async function waitForDutiesLoaded(service: DutiesService): Promise<void> {
  await vi.waitFor(() => {
    expect(service.loading()).toBe(false);
  });
}

function createService(doc$: () => Observable<RaceDay | undefined>, docRef: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      DutiesService,
      { provide: FirestoreTenantService, useValue: { docRef } },
      { provide: RACE_DAY_DOC_DATA, useValue: doc$ },
      { provide: RACE_DAY_SET_DOC, useValue: raceDaySetDoc },
    ],
  });
  const service = TestBed.inject(DutiesService);
  service.setRequestedDate('2026-08-14');
  return service;
}

describe('DutiesService', () => {
  let docRef: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    raceDaySetDoc.mockResolvedValue(undefined);
    docRef = vi.fn(() => ({ path: 'clubs/ibrsc/race-days/2026-08-14' }));
  });

  it("reads the day's duty team from the race-day document", async () => {
    const service = createService(() => of(sampleRaceDay), docRef);
    await waitForDutiesLoaded(service);

    expect(docRef).toHaveBeenCalledWith('race-days', '2026-08-14');
    expect(service.duties()).toEqual([sampleMember]);
    expect(service.hasDutyTeam()).toBe(true);
    expect(service.error()).toBeNull();
  });

  it('has no duty team when the race-day document is missing', async () => {
    const service = createService(() => of(undefined), docRef);
    await waitForDutiesLoaded(service);

    expect(service.duties()).toEqual([]);
    expect(service.hasDutyTeam()).toBe(false);
  });

  it('shows the duty team once the document appears', async () => {
    const doc$ = new BehaviorSubject<RaceDay | undefined>(undefined);
    const service = createService(() => doc$.asObservable(), docRef);
    await waitForDutiesLoaded(service);
    expect(service.hasDutyTeam()).toBe(false);

    doc$.next(sampleRaceDay);

    await vi.waitFor(() => {
      expect(service.hasDutyTeam()).toBe(true);
    });
  });

  it('writes status to Firestore and waits for the write', async () => {
    const service = createService(() => of(sampleRaceDay), docRef);
    await waitForDutiesLoaded(service);

    const ok = await service.setStatus(sampleMember, 'attending');

    expect(ok).toBe(true);
    expect(raceDaySetDoc).toHaveBeenCalledWith(
      { path: 'clubs/ibrsc/race-days/2026-08-14' },
      {
        dutyTeam: [{ ...sampleMember, status: 'attending' }],
      },
    );
  });

  it('sets an error when the Firestore write fails', async () => {
    const service = createService(() => of(sampleRaceDay), docRef);
    await waitForDutiesLoaded(service);
    raceDaySetDoc.mockRejectedValue(new Error('Update failed'));

    const ok = await service.setStatus(sampleMember, 'confirmed');

    expect(ok).toBe(false);
    expect(service.error()).toBe('Update failed');
  });
});
