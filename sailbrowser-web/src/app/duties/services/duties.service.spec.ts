import { TestBed } from '@angular/core/testing';
import { FirebaseApp } from '@angular/fire/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DutyMember } from '@shared/duty-member';
import { ClubTenant } from 'app/club-tenant';
import { DUTY_REGISTER_CLUB_ID, DutiesService } from './duties.service';

const sampleMember: DutyMember = {
  role: 'duty race officer',
  name: 'David RYDER',
  attending: false,
  key: '89744d04299c8b1c4b58d786776d80',
};

const getDutyTeamForDay = vi.fn();
const setDutyAttendance = vi.fn();

vi.mock('@angular/fire/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  connectFunctionsEmulator: vi.fn(),
  httpsCallable: vi.fn((_functions, name: string) => {
    if (name === 'getDutyTeamForDay') return getDutyTeamForDay;
    if (name === 'setDutyAttendance') return setDutyAttendance;
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

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    getDutyTeamForDay.mockResolvedValue({ data: { duties: [sampleMember] } });
    setDutyAttendance.mockResolvedValue({ data: { success: true } });

    TestBed.configureTestingModule({
      providers: [
        DutiesService,
        { provide: FirebaseApp, useValue: {} },
        { provide: ClubTenant, useValue: { clubId: DUTY_REGISTER_CLUB_ID } },
      ],
    });
    service = TestBed.inject(DutiesService);
  });

  it('loads today’s duties from the callable when no date is set', async () => {
    await waitForDutiesLoaded(service);

    expect(getDutyTeamForDay).toHaveBeenCalledWith({});
    expect(service.duties()).toEqual([sampleMember]);
    expect(service.error()).toBeNull();
  });

  it('loads duties for an explicit requested date', async () => {
    service.setRequestedDate('2026-6-21');
    await waitForDutiesLoaded(service);

    expect(getDutyTeamForDay).toHaveBeenCalledWith({ date: '2026-6-21' });
    expect(service.duties()).toEqual([sampleMember]);
  });

  it('does not fetch duties for other clubs', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DutiesService,
        { provide: FirebaseApp, useValue: {} },
        { provide: ClubTenant, useValue: { clubId: 'test' } },
      ],
    });
    service = TestBed.inject(DutiesService);

    await waitForDutiesLoaded(service);

    expect(getDutyTeamForDay).not.toHaveBeenCalled();
    expect(service.duties()).toEqual([]);
  });

  it('sets a load error when fetching fails', async () => {
    getDutyTeamForDay.mockRejectedValue(new Error('Network down'));

    await waitForDutiesLoaded(service);

    expect(service.error()).toBe('Network down');
    expect(service.duties()).toEqual([]);
  });

  it('updates attendance via callable and keeps optimistic state on success', async () => {
    await waitForDutiesLoaded(service);

    await service.setAttending(sampleMember, true);

    expect(setDutyAttendance).toHaveBeenCalledWith({
      key: sampleMember.key,
      attending: true,
    });
    expect(service.duties()[0]?.attending).toBe(true);
    expect(service.updatingAckKeys().has(sampleMember.key)).toBe(false);
  });

  it('reverts optimistic attendance when the callable fails', async () => {
    await waitForDutiesLoaded(service);
    setDutyAttendance.mockRejectedValue(new Error('Update failed'));

    await service.setAttending(sampleMember, true);

    expect(service.duties()[0]?.attending).toBe(false);
    expect(service.error()).toBe('Update failed');
  });
});
