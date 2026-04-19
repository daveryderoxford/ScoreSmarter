import { TestBed } from '@angular/core/testing';
import { RaceCompetitor } from '../model/race-competitor';
import { SeriesEntryStore } from './series-entry-store';
import { RaceCompetitorStore } from './race-competitor-store';
import { RaceCompetitorEditService } from './race-competitor-edit.service';
import { SeriesEntry } from '../model/series-entry';

class FakeRaceCompetitorStore {
  comps: RaceCompetitor[] = [];
  readonly selectedCompetitors = () => this.comps;
  async getSeriesCompetitors(seriesId: string): Promise<RaceCompetitor[]> {
    return this.comps.filter(c => c.seriesId === seriesId);
  }
  async updateResult(id: string, changes: Partial<RaceCompetitor>) {
    const idx = this.comps.findIndex(c => c.id === id);
    this.comps[idx] = new RaceCompetitor({ ...this.comps[idx], ...changes });
  }
  async deleteResult(id: string) {
    this.comps = this.comps.filter(c => c.id !== id);
  }
}

class FakeSeriesEntryStore {
  entries: SeriesEntry[] = [];
  readonly selectedEntries = () => this.entries;
  async getSeriesEntries(seriesId: string): Promise<SeriesEntry[]> {
    return this.entries.filter(e => e.seriesId === seriesId);
  }
  async addEntry(entry: Partial<SeriesEntry>): Promise<string> {
    const id = `se-${this.entries.length + 1}`;
    this.entries.push({ ...(entry as SeriesEntry), id });
    return id;
  }
  async updateEntry(id: string, changes: Partial<SeriesEntry>) {
    const idx = this.entries.findIndex(e => e.id === id);
    this.entries[idx] = { ...this.entries[idx], ...changes };
  }
  async deleteEntry(id: string) {
    this.entries = this.entries.filter(e => e.id !== id);
  }
}

describe('RaceCompetitorEditService', () => {
  let service: RaceCompetitorEditService;
  let compStore: FakeRaceCompetitorStore;
  let entryStore: FakeSeriesEntryStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RaceCompetitorEditService,
        { provide: RaceCompetitorStore, useClass: FakeRaceCompetitorStore },
        { provide: SeriesEntryStore, useClass: FakeSeriesEntryStore },
      ],
    });
    service = TestBed.inject(RaceCompetitorEditService);
    compStore = TestBed.inject(RaceCompetitorStore) as unknown as FakeRaceCompetitorStore;
    entryStore = TestBed.inject(SeriesEntryStore) as unknown as FakeSeriesEntryStore;
  });

  it('writes helm change to the SeriesEntry (no per-race scope)', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'setHelm', value: 'New Helm' },
    });

    expect(entryStore.entries[0].helm).toBe('New Helm');
    // RaceCompetitor rows should be untouched - identity is now resolved via the entry.
    expect(compStore.comps.every(c => (c as any).helm === undefined)).toBe(true);
  });

  it('records crewOverride on RaceCompetitor for raceOnly crew change', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Old', crew: 'A', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'setCrew', value: 'Crew X', scope: 'raceOnly' },
    });

    expect(compStore.comps.find(c => c.id === 'c1')?.crewOverride).toBe('Crew X');
    expect(compStore.comps.find(c => c.id === 'c2')?.crewOverride).toBeUndefined();
    expect(entryStore.entries[0].crew).toBe('A');
  });

  it('writes wholeSeries crew to the SeriesEntry', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Old', crew: 'A', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'setCrew', value: 'New Crew', scope: 'wholeSeries' },
    });

    expect(entryStore.entries[0].crew).toBe('New Crew');
  });

  it('refuses to rename helm when the new identity collides with another entry in the series', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
      { id: 'se-2', seriesId: 's1', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-2' }),
    ];

    await expect(
      service.apply({ competitorId: 'c1', operation: { type: 'setHelm', value: 'Sam' } }),
    ).rejects.toThrowError(/Cannot rename/);

    // Entry must be unchanged - no partial write.
    expect(entryStore.entries.find(e => e.id === 'se-2')?.helm).toBe('Bob');
  });

  it('uses case-insensitive normalisation when detecting rename collisions', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Sam Skipper', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
      { id: 'se-2', seriesId: 's1', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-2' }),
    ];

    await expect(
      service.apply({ competitorId: 'c1', operation: { type: 'setHelm', value: '  sam SKIPPER  ' } }),
    ).rejects.toThrowError(/Cannot rename/);
  });

  it('refuses to rename sail number into another entry', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
      { id: 'se-2', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 200, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-2' }),
    ];

    await expect(
      service.apply({ competitorId: 'c1', operation: { type: 'setSailNumber', value: 100 } }),
    ).rejects.toThrowError(/Cannot rename/);
    expect(entryStore.entries.find(e => e.id === 'se-2')?.sailNumber).toBe(200);
  });

  it('allows rename when only the entry being edited matches the new identity (case fix)', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'sam', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
    ];

    await service.apply({ competitorId: 'c1', operation: { type: 'setHelm', value: 'Sam' } });

    expect(entryStore.entries[0].helm).toBe('Sam');
  });

  it('ignores entries in OTHER series when checking for a rename collision', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
      // Same identity but different series - must not block the rename.
      { id: 'se-99', seriesId: 's2', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
    ];

    await service.apply({ competitorId: 'c1', operation: { type: 'setHelm', value: 'Sam' } });

    expect(entryStore.entries.find(e => e.id === 'se-1')?.helm).toBe('Sam');
  });

  it('deletes orphaned series entry after deleting last competitor', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'deleteCompetitor' },
    });

    expect(compStore.comps.length).toBe(0);
    expect(entryStore.entries.find(e => e.id === 'se-1')).toBeUndefined();
  });
});
