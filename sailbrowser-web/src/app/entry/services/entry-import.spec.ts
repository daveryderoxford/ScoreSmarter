import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import type { Race } from 'app/race-calender/model/race';
import { RaceCompetitorMutator } from 'app/results-input/services/race-competitor-mutator';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { EntryService } from './entry.service';

function makeRace(over: Partial<Race> & Pick<Race, 'id' | 'seriesId'>): Race {
  return {
    seriesName: 'Test Series',
    fleetId: 'f1',
    index: 1,
    scheduledStart: new Date(),
    raceOfDay: 1,
    type: 'Pursuit',
    status: 'Future',
    isDiscardable: true,
    isAverageLap: false,
    dirty: false,
    resultsSheetImage: '',
    ...over,
  } as Race;
}

describe('EntryService.importEntries', () => {
  let service: EntryService;
  const createSeriesEntry = vi.fn();
  const addResult = vi.fn();

  beforeEach(() => {
    createSeriesEntry.mockReset();
    addResult.mockReset();
    createSeriesEntry.mockResolvedValue('se-1');
    addResult.mockResolvedValue('rc-1');

    TestBed.configureTestingModule({
      providers: [
        EntryService,
        { provide: RaceCompetitorStore, useValue: { addResult, selectedCompetitors: () => [] } },
        { provide: SeriesEntryStore, useValue: { selectedEntries: () => [] } },
        { provide: RaceCalendarStore, useValue: { allSeries: () => [], allRaces: () => [] } },
        { provide: ClubStore, useValue: { club: () => ({ classes: [] }) } },
        { provide: Firestore, useValue: {} },
        { provide: RaceCompetitorMutator, useValue: { createSeriesEntry } },
      ],
    });
    service = TestBed.inject(EntryService);
  });

  it('creates a series entry and competitors for every race, including club', async () => {
    const races = [
      makeRace({ id: 'r1', seriesId: 's1', index: 1 }),
      makeRace({ id: 'r2', seriesId: 's1', index: 2 }),
    ];

    await service.importEntries({
      errors: [],
      series: [
        {
          seriesId: 's1',
          races,
          entries: [
            {
              helm: 'Alice',
              boatClass: 'ILCA 7',
              sailNumber: '1234',
              club: 'HYC',
              tags: ['gold'],
              handicaps: [{ scheme: 'PY', value: 1100 }],
            },
          ],
        },
      ],
    });

    expect(createSeriesEntry).toHaveBeenCalledWith({
      seriesId: 's1',
      helm: 'Alice',
      crew: undefined,
      club: 'HYC',
      boatClass: 'ILCA 7',
      sailNumber: '1234',
      handicaps: [{ scheme: 'PY', value: 1100 }],
      tags: ['gold'],
    });
    expect(addResult).toHaveBeenCalledTimes(2);
    expect(addResult).toHaveBeenCalledWith({
      raceId: 'r1',
      seriesId: 's1',
      seriesEntryId: 'se-1',
      resultCode: 'NOT FINISHED',
    });
    expect(addResult).toHaveBeenCalledWith({
      raceId: 'r2',
      seriesId: 's1',
      seriesEntryId: 'se-1',
      resultCode: 'NOT FINISHED',
    });
  });

  it('refuses a plan that still has errors', async () => {
    await expect(
      service.importEntries({
        errors: ['Line 2: helm is required'],
        series: [],
      }),
    ).rejects.toThrow(/validation errors/);
    expect(createSeriesEntry).not.toHaveBeenCalled();
    expect(addResult).not.toHaveBeenCalled();
  });
});
