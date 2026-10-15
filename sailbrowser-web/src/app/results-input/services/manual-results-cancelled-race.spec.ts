import { TestBed } from '@angular/core/testing';
import { ClubStore } from 'app/club-tenant';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceCompetitor } from '../model/race-competitor';
import { ManualResultsService, OrderEntryRowState } from './manual-results.service';
import { RaceCompetitorMutator } from './race-competitor-mutator';
import { RaceCompetitorStore } from './race-competitor-store';
import { SeriesEntryStore } from './series-entry-store';

describe('ManualResultsService race status', () => {
  let updateRace: ReturnType<typeof vi.fn>;
  let service: ManualResultsService;

  const competitor = { id: 'c1', raceId: 'r1', resultCode: 'NOT FINISHED' } as RaceCompetitor;
  const finished = new Map<string, OrderEntryRowState>([
    ['c1', { resultCode: 'OK', manualFinishTime: null, rankOverride: null }],
  ]);

  beforeEach(() => {
    updateRace = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        { provide: RaceCalendarStore, useValue: { updateRace } },
        { provide: RaceCompetitorMutator, useValue: { updateRaceCompetitorsBulk: vi.fn(() => Promise.resolve()) } },
        { provide: RaceCompetitorStore, useValue: {} },
        { provide: SeriesEntryStore, useValue: {} },
        { provide: ClubStore, useValue: {} },
      ],
    });
    service = TestBed.inject(ManualResultsService);
  });

  const persist = (status: Race['status']) =>
    service.persistOrderEntryState({
      race: { id: 'r1', status } as Race,
      competitors: [competitor],
      processedIds: ['c1'],
      rowState: finished,
    });

  it('moves a race to Completed when every boat has finished', async () => {
    await persist('Future');
    expect(updateRace).toHaveBeenCalledWith('r1', { status: 'Completed' });
  });

  it('leaves a cancelled race cancelled', async () => {
    await persist('Canceled');
    expect(updateRace).not.toHaveBeenCalled();
  });
});
