import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubStore } from 'app/club-tenant/services/club-store';
import { RatingListStore } from 'app/system-data/services/rating-list-store';
import type { Race } from 'app/race-calendar/model/race';
import type { Series } from 'app/race-calendar/model/series';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import type { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { RaceCompetitorMutator } from 'app/results-input/services/race-competitor-mutator';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { FIRESTORE_WRITES } from 'app/shared/firebase/firestore-writes';
import { EventEntryService, mapDivisionsByName } from './event-entry.service';

function classSeries(id: string, boatClassId: string, divisions: Series['divisions'] = []): Series {
  return {
    id,
    seasonId: '2026',
    name: `Open ${boatClassId}`,
    eventId: 'e1',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'helm',
    discards: [],
    divisions,
    primaryScoringConfiguration: {
      id: 'overall',
      name: boatClassId,
      type: 'LevelRating',
      handicapScheme: 'Level Rating',
      fleet: { type: 'BoatClass', id: boatClassId, boatClassId },
    },
  };
}

const race = (id: string, seriesId: string, status: Race['status'] = 'Future') => ({ id, seriesId, status }) as Race;
const row = (id: string, raceId: string, resultCode: RaceCompetitor['resultCode'] = 'NOT FINISHED') =>
  ({ id, raceId, seriesEntryId: 'se-old', resultCode }) as RaceCompetitor;

const aero9 = classSeries('s9', 'Aero 9');
const aero7 = classSeries('s7', 'Aero 7');
const oldEntry = {
  id: 'se-old', seriesId: 's9', helm: 'Sam', boatClass: 'Aero 9', sailNumber: '101', handicaps: [], divisions: [],
} as SeriesEntry;

describe('EventEntryService', () => {
  let service: EventEntryService;
  let racesBySeries: Record<string, Race[]>;
  let entryRows: RaceCompetitor[];
  const createSeriesEntry = vi.fn();
  const addResult = vi.fn();
  const batch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    createSeriesEntry.mockResolvedValue('se-new');
    addResult.mockResolvedValue('rc');
    racesBySeries = {
      s9: [race('r9a', 's9'), race('r9b', 's9')],
      s7: [race('r7a', 's7'), race('r7b', 's7')],
    };
    entryRows = [row('c1', 'r9a'), row('c2', 'r9b')];

    TestBed.configureTestingModule({
      providers: [
        EventEntryService,
        { provide: Firestore, useValue: {} },
        { provide: FIRESTORE_WRITES, useValue: { writeBatch: () => batch } },
        {
          provide: RaceCalendarStore,
          useValue: {
            allSeries: () => [aero9, aero7],
            getSeriesRacesById: async (id: string) => racesBySeries[id] ?? [],
            ensureRaceDirty: vi.fn(),
          },
        },
        { provide: ClubStore, useValue: { club: () => ({ classes: [] }) } },
        { provide: RatingListStore, useValue: { load: async () => [] } },
        { provide: RaceCompetitorMutator, useValue: { createSeriesEntry } },
        {
          provide: RaceCompetitorStore,
          useValue: {
            addResult,
            getCompetitorsForSeriesEntry: async () => entryRows,
            getSeriesCompetitors: async () => [],
            raceResultDocRef: (id: string) => ({ id }),
          },
        },
        { provide: SeriesEntryStore, useValue: { getSeriesEntries: async () => [], seriesEntryDocRef: (id: string) => ({ id }) } },
      ],
    });
    service = TestBed.inject(EventEntryService);
  });

  const toAero7 = { seriesId: 's7', helm: 'Sam', boatClass: 'Aero 7', sailNumber: '101', divisions: [] };

  it('adds an entry with a row on each race that has not started', async () => {
    racesBySeries['s7'] = [race('r7a', 's7', 'Completed'), race('r7b', 's7')];
    await service.addEntry(toAero7);
    expect(addResult).toHaveBeenCalledTimes(1);
    expect(addResult).toHaveBeenCalledWith({ raceId: 'r7b', seriesId: 's7', seriesEntryId: 'se-new', resultCode: 'NOT FINISHED' });
  });

  it('refuses a class that is not in the series fleet', async () => {
    await expect(service.addEntry({ ...toAero7, boatClass: 'Aero 9' })).rejects.toThrow(/not in the Aero 7 fleet/);
    expect(createSeriesEntry).not.toHaveBeenCalled();
  });

  it('moves an entry before racing: new entry on every destination race, old rows and entry deleted', async () => {
    await service.moveEntry(oldEntry, toAero7);
    expect(createSeriesEntry).toHaveBeenCalledWith(expect.objectContaining({ seriesId: 's7', boatClass: 'Aero 7' }));
    expect(addResult.mock.calls.map(([r]) => r.raceId)).toEqual(['r7a', 'r7b']);
    expect(batch.delete.mock.calls.map(([ref]) => ref.id)).toEqual(['c1', 'c2', 'se-old']);
  });

  it('refuses to move once a race in either series has a result', async () => {
    racesBySeries['s7'] = [race('r7a', 's7', 'In progress'), race('r7b', 's7')];
    await expect(service.moveEntry(oldEntry, toAero7)).rejects.toThrow(/Racing has started/);
    expect(createSeriesEntry).not.toHaveBeenCalled();
    expect(batch.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete an entry that has results', async () => {
    entryRows = [row('c1', 'r9a', 'OK')];
    await expect(service.deleteEntry(oldEntry)).rejects.toThrow(/has results/);
    expect(batch.delete).not.toHaveBeenCalled();
  });

  it('maps divisions between series by name', () => {
    const from = classSeries('a', 'Aero 9', [{ id: 'y9', name: 'Youth', scoreAs: 'none', display: { style: 'text' } }]);
    const to = classSeries('b', 'Aero 7', [{ id: 'y7', name: 'youth ', scoreAs: 'none', display: { style: 'text' } }]);
    expect(mapDivisionsByName(['y9'], from, to)).toEqual(['y7']);
  });
});
