import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import type { Race } from 'app/race-calender/model/race';
import type { Series } from 'app/race-calender/model/series';
import type { RaceCompetitor } from 'app/results-input/model/race-competitor';
import { RaceCompetitorMutator } from 'app/results-input/services/race-competitor-mutator';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { EntryService } from './entry.service';

function makeRace(): Race {
  return {
    id: 'r1',
    seriesId: 's1',
    seriesName: 'Test Series',
    fleetId: 'f1',
    index: 1,
    scheduledStart: new Date(),
    raceOfDay: 1,
    type: 'Pursuit',
    status: 'Upcoming',
    isDiscardable: true,
    isAverageLap: false,
    dirty: false,
  } as unknown as Race;
}

function makeSeries(): Series {
  return {
    id: 's1',
    seasonId: 'season1',
    name: 'Test',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'helm',
    discards: [4],
    primaryScoringConfiguration: {
      id: 'cfg-py',
      name: 'PY',
      type: 'Handicap',
      handicapScheme: 'PY',
      fleet: { type: 'GeneralHandicap', id: 'f1', name: 'General' },
    } as never,
  };
}

describe('EntryService.enterRaces resultCode', () => {
  let service: EntryService;
  let added: Partial<RaceCompetitor>[];

  beforeEach(() => {
    added = [];
    TestBed.configureTestingModule({
      providers: [
        EntryService,
        {
          provide: RaceCompetitorStore,
          useValue: {
            selectedCompetitors: () => [],
            addResult: vi.fn(async (row: Partial<RaceCompetitor>) => {
              added.push(row);
              return 'rc-1';
            }),
          },
        },
        {
          provide: SeriesEntryStore,
          useValue: { selectedEntries: () => [] },
        },
        {
          provide: RaceCompetitorMutator,
          useValue: { createSeriesEntry: vi.fn().mockResolvedValue('e1') },
        },
        {
          provide: RaceCalendarStore,
          useValue: { allSeries: () => [makeSeries()], allRaces: () => [] },
        },
        {
          provide: ClubStore,
          useValue: { club: () => ({ classes: [] }) },
        },
      ],
    });
    service = TestBed.inject(EntryService);
  });

  it('defaults result code to NOT FINISHED', async () => {
    await service.enterRaces({
      races: [makeRace()],
      helm: 'Sam',
      boatClass: 'ILCA 7',
      sailNumber: '100',
    });
    expect(added[0]?.resultCode).toBe('NOT FINISHED');
    expect(added[0]?.seriesEntryId).toBe('e1');
  });

  it('writes OOD when requested', async () => {
    await service.enterRaces({
      races: [makeRace()],
      helm: 'Sam',
      boatClass: 'ILCA 7',
      sailNumber: '100',
      resultCode: 'OOD',
    });
    expect(added[0]?.resultCode).toBe('OOD');
  });
});
