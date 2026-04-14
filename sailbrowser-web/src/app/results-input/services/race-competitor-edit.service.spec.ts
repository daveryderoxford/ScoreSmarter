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

  it('updates linked competitors for helm change', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] }),
      new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'setHelm', value: 'New Helm', scope: 'linkedBySeriesEntry' },
    });

    expect(compStore.comps.every(c => c.helm === 'New Helm')).toBe(true);
    expect(entryStore.entries[0].helm).toBe('New Helm');
  });

  it('updates race only for crew change', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1', helm: 'Old', crew: 'A', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] }),
      new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1', helm: 'Old', crew: 'B', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'setCrew', value: 'Crew X', scope: 'raceOnly' },
    });

    expect(compStore.comps.find(c => c.id === 'c1')?.crew).toBe('Crew X');
    expect(compStore.comps.find(c => c.id === 'c2')?.crew).toBe('B');
  });

  it('deletes orphaned series entry after deleting last competitor', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: 123, handicaps: [] }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'deleteCompetitor', scope: 'raceOnly' },
    });

    expect(compStore.comps.length).toBe(0);
    expect(entryStore.entries.find(e => e.id === 'se-1')).toBeUndefined();
  });
});
