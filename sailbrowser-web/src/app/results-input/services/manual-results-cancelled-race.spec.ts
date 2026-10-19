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
  let updateRaceCompetitorsBulk: ReturnType<typeof vi.fn>;
  let service: ManualResultsService;

  const competitor = { id: 'c1', raceId: 'r1', resultCode: 'NOT FINISHED' } as RaceCompetitor;
  const finished = new Map<string, OrderEntryRowState>([
    ['c1', { resultCode: 'OK', manualFinishTime: null, rankOverride: null }],
  ]);

  beforeEach(() => {
    updateRace = vi.fn(() => Promise.resolve());
    updateRaceCompetitorsBulk = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        { provide: RaceCalendarStore, useValue: { updateRace } },
        { provide: RaceCompetitorMutator, useValue: { updateRaceCompetitorsBulk } },
        { provide: RaceCompetitorStore, useValue: {} },
        { provide: SeriesEntryStore, useValue: {} },
        { provide: ClubStore, useValue: {} },
      ],
    });
    service = TestBed.inject(ManualResultsService);
  });

  it('writes results but leaves the race status to the server trigger', async () => {
    await service.persistOrderEntryState({
      race: { id: 'r1', status: 'Future' } as Race,
      competitors: [competitor],
      processedIds: ['c1'],
      rowState: finished,
    });

    expect(updateRaceCompetitorsBulk).toHaveBeenCalled();
    expect(updateRace).not.toHaveBeenCalled();
  });
});
