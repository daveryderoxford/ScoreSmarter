import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import type { Race } from 'app/race-calender/model/race';
import type { Series } from 'app/race-calender/model/series';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import type { SeriesEntryMatchingStrategy } from 'app/entry/model/entry-grouping';

import { EntryDetails, EntryService } from './entry.service';

class FakeRaceCompetitorStore {
  comps: RaceCompetitor[] = [];
  readonly selectedCompetitors = () => this.comps;
  async addResult(result: Partial<RaceCompetitor>): Promise<string> {
    const id = `rc-${this.comps.length + 1}`;
    this.comps.push(new RaceCompetitor({ ...(result as RaceCompetitor), id }));
    return id;
  }
  async deleteResult(id: string): Promise<void> {
    this.comps = this.comps.filter(c => c.id !== id);
  }
}

class FakeSeriesEntryStore {
  entries: SeriesEntry[] = [];
  readonly selectedEntries = () => this.entries;
  async addEntry(entry: Partial<SeriesEntry>): Promise<string> {
    const id = `se-${this.entries.length + 1}`;
    this.entries.push({ ...(entry as SeriesEntry), id });
    return id;
  }
  async updateEntry(id: string, changes: Partial<SeriesEntry>): Promise<void> {
    const idx = this.entries.findIndex(e => e.id === id);
    this.entries[idx] = { ...this.entries[idx], ...changes };
  }
  async deleteEntry(id: string): Promise<void> {
    this.entries = this.entries.filter(e => e.id !== id);
  }
}

class FakeRaceCalendarStore {
  series: Series[] = [];
  readonly allSeries = () => this.series;
}

class FakeClubStore {
  readonly club = () => ({ classes: [] as unknown[] }) as never;
}

function makeRace(over: Partial<Race> & Pick<Race, 'id' | 'seriesId'>): Race {
  return {
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
    ...over,
  } as Race;
}

function makeSeries(strategy: SeriesEntryMatchingStrategy, id = 's1'): Series {
  return {
    id,
    seasonId: 'season1',
    name: 'Test',
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: strategy,
    initialDiscardAfter: 4,
    subsequentDiscardsEveryN: 0,
    primaryScoringConfiguration: {
      id: 'cfg-py',
      name: 'PY',
      type: 'Handicap',
      handicapScheme: 'PY',
      fleet: { type: 'GeneralHandicap', id: 'f1', name: 'General' },
    } as never,
  };
}

function makeEntry(over: Partial<SeriesEntry> & Pick<SeriesEntry, 'id'>): SeriesEntry {
  return {
    seriesId: 's1',
    helm: 'Sam',
    boatClass: 'ILCA 7',
    sailNumber: 100,
    handicaps: [],
    ...over,
  } as SeriesEntry;
}

function makeComp(seriesEntryId: string, raceId: string, id: string): RaceCompetitor {
  return new RaceCompetitor({
    id,
    raceId,
    seriesId: 's1',
    seriesEntryId,
    resultCode: 'NOT FINISHED',
  } as never);
}

describe('EntryService.findEntryConflicts', () => {
  let service: EntryService;
  let comps: FakeRaceCompetitorStore;
  let entries: FakeSeriesEntryStore;
  let cal: FakeRaceCalendarStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EntryService,
        { provide: RaceCompetitorStore, useClass: FakeRaceCompetitorStore },
        { provide: SeriesEntryStore, useClass: FakeSeriesEntryStore },
        { provide: RaceCalendarStore, useClass: FakeRaceCalendarStore },
        { provide: ClubStore, useClass: FakeClubStore },
      ],
    });
    service = TestBed.inject(EntryService);
    comps = TestBed.inject(RaceCompetitorStore) as unknown as FakeRaceCompetitorStore;
    entries = TestBed.inject(SeriesEntryStore) as unknown as FakeSeriesEntryStore;
    cal = TestBed.inject(RaceCalendarStore) as unknown as FakeRaceCalendarStore;
  });

  const proposed = (over?: Partial<EntryDetails>): EntryDetails => ({
    races: [makeRace({ id: 'r1', seriesId: 's1' })],
    helm: 'Sam',
    boatClass: 'ILCA 7',
    sailNumber: 100,
    ...over,
  });

  it('returns empty when nothing is signed on yet', () => {
    cal.series = [makeSeries('helm')];
    expect(service.findEntryConflicts(proposed())).toEqual([]);
  });

  it('flags an exact identity duplicate as sameEntry', () => {
    cal.series = [makeSeries('classSailNumberHelm')];
    entries.entries = [makeEntry({ id: 'e1' })];
    comps.comps = [makeComp('e1', 'r1', 'rc1')];

    const result = service.findEntryConflicts(proposed());
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('sameEntry');
    expect(result[0].existingCompetitor.id).toBe('rc1');
    expect(result[0].existingEntry.id).toBe('e1');
    expect(result[0].race.id).toBe('r1');
  });

  it('flags helm-already-in-race for a merged-helm series even when boat differs', () => {
    cal.series = [makeSeries('helm')];
    entries.entries = [makeEntry({ id: 'e1', boatClass: 'RS Aero 6', sailNumber: 4787 })];
    comps.comps = [makeComp('e1', 'r1', 'rc1')];

    const result = service.findEntryConflicts(
      proposed({ boatClass: 'RS Aero 9', sailNumber: 4787 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('sameHelmDifferentHull');
  });

  it('does NOT flag helm-on-different-boat for a strict (classSailNumberHelm) series', () => {
    cal.series = [makeSeries('classSailNumberHelm')];
    entries.entries = [makeEntry({ id: 'e1', boatClass: 'RS Aero 6', sailNumber: 4787 })];
    comps.comps = [makeComp('e1', 'r1', 'rc1')];

    expect(
      service.findEntryConflicts(proposed({ boatClass: 'RS Aero 9', sailNumber: 4787 })),
    ).toEqual([]);
  });

  it('flags hull-already-in-race for a merged-hull (classSailNumber) series', () => {
    cal.series = [makeSeries('classSailNumber')];
    entries.entries = [makeEntry({ id: 'e1', helm: 'Bob' })];
    comps.comps = [makeComp('e1', 'r1', 'rc1')];

    const result = service.findEntryConflicts(proposed({ helm: 'Sam' }));
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('sameHullDifferentHelm');
  });

  it('aggregates conflicts across multiple races in one call', () => {
    cal.series = [makeSeries('helm')];
    entries.entries = [makeEntry({ id: 'e1', boatClass: 'RS Aero 6', sailNumber: 4787 })];
    comps.comps = [
      makeComp('e1', 'r1', 'rc1'),
      makeComp('e1', 'r2', 'rc2'),
    ];

    const result = service.findEntryConflicts(
      proposed({
        races: [
          makeRace({ id: 'r1', seriesId: 's1' }),
          makeRace({ id: 'r2', seriesId: 's1' }),
        ],
        boatClass: 'RS Aero 9',
      }),
    );
    expect(result.map(c => c.race.id)).toEqual(['r1', 'r2']);
  });

  it('ignores existing entries in OTHER races', () => {
    cal.series = [makeSeries('helm')];
    entries.entries = [makeEntry({ id: 'e1' })];
    comps.comps = [makeComp('e1', 'r-other', 'rc1')];

    expect(service.findEntryConflicts(proposed())).toEqual([]);
  });
});

describe('EntryService.swapAndEnter', () => {
  let service: EntryService;
  let comps: FakeRaceCompetitorStore;
  let entries: FakeSeriesEntryStore;
  let cal: FakeRaceCalendarStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EntryService,
        { provide: RaceCompetitorStore, useClass: FakeRaceCompetitorStore },
        { provide: SeriesEntryStore, useClass: FakeSeriesEntryStore },
        { provide: RaceCalendarStore, useClass: FakeRaceCalendarStore },
        { provide: ClubStore, useClass: FakeClubStore },
      ],
    });
    service = TestBed.inject(EntryService);
    comps = TestBed.inject(RaceCompetitorStore) as unknown as FakeRaceCompetitorStore;
    entries = TestBed.inject(SeriesEntryStore) as unknown as FakeSeriesEntryStore;
    cal = TestBed.inject(RaceCalendarStore) as unknown as FakeRaceCalendarStore;
  });

  it('removes the conflicting race competitor and signs the new entry on', async () => {
    cal.series = [makeSeries('helm')];
    entries.entries = [makeEntry({ id: 'e1', boatClass: 'RS Aero 6', sailNumber: 4787 })];
    comps.comps = [makeComp('e1', 'r1', 'rc1')];

    const details: EntryDetails = {
      races: [makeRace({ id: 'r1', seriesId: 's1' })],
      helm: 'Sam',
      boatClass: 'RS Aero 9',
      sailNumber: 4787,
    };
    const conflicts = service.findEntryConflicts(details);
    expect(conflicts).toHaveLength(1);

    await service.swapAndEnter(details, conflicts);

    // Old competitor row must be gone; exactly one row in race r1 now,
    // pointing at the new (Aero 9) entry.
    expect(comps.comps).toHaveLength(1);
    expect(comps.comps[0].id).not.toBe('rc1');

    const newEntry = entries.entries.find(e => e.id === comps.comps[0].seriesEntryId);
    expect(newEntry?.boatClass).toBe('RS Aero 9');
  });

  it('cleans up the old SeriesEntry when the swap leaves it orphaned', async () => {
    cal.series = [makeSeries('helm')];
    entries.entries = [makeEntry({ id: 'e1', boatClass: 'RS Aero 6', sailNumber: 4787 })];
    comps.comps = [makeComp('e1', 'r1', 'rc1')];

    await service.swapAndEnter(
      {
        races: [makeRace({ id: 'r1', seriesId: 's1' })],
        helm: 'Sam',
        boatClass: 'RS Aero 9',
        sailNumber: 4787,
      },
      service.findEntryConflicts({
        races: [makeRace({ id: 'r1', seriesId: 's1' })],
        helm: 'Sam',
        boatClass: 'RS Aero 9',
        sailNumber: 4787,
      }),
    );

    expect(entries.entries.some(e => e.id === 'e1')).toBe(false);
  });

  it('preserves the old SeriesEntry when it is still used in another race', async () => {
    cal.series = [makeSeries('helm')];
    entries.entries = [makeEntry({ id: 'e1', boatClass: 'RS Aero 6', sailNumber: 4787 })];
    comps.comps = [
      makeComp('e1', 'r1', 'rc1'),
      makeComp('e1', 'r2', 'rc2'),
    ];

    const details: EntryDetails = {
      races: [makeRace({ id: 'r1', seriesId: 's1' })],
      helm: 'Sam',
      boatClass: 'RS Aero 9',
      sailNumber: 4787,
    };
    await service.swapAndEnter(details, service.findEntryConflicts(details));

    // Aero 6 entry still exists because rc2 (race r2) still references it.
    expect(entries.entries.some(e => e.id === 'e1')).toBe(true);
    // r2 row untouched.
    expect(comps.comps.some(c => c.id === 'rc2')).toBe(true);
  });
});
