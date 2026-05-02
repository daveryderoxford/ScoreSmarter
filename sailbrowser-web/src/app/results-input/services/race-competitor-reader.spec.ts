import { Injectable, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RaceCompetitor } from '../model/race-competitor';
import { resolveRaceCompetitors } from '../model/resolved-race-competitor';
import type { SeriesEntry } from '../model/series-entry';

import { RaceCompetitorReader } from './race-competitor-reader';
import { RaceCompetitorStore } from './race-competitor-store';
import { SeriesEntryStore } from './series-entry-store';

@Injectable()
class FakeRaceCompetitorStore {
  private readonly _comps = signal<RaceCompetitor[]>([]);
  readonly selectedCompetitors = this._comps.asReadonly();
  readonly loading = signal(false).asReadonly();

  setCompetitors(v: RaceCompetitor[]): void {
    this._comps.set(v);
  }
}

@Injectable()
class FakeSeriesEntryStore {
  private readonly _entries = signal<SeriesEntry[]>([]);
  readonly selectedEntries = this._entries.asReadonly();
  readonly loading = signal(false).asReadonly();

  setEntries(v: SeriesEntry[]): void {
    this._entries.set(v);
  }
}

function competitorsMissingSeriesEntry(
  competitors: readonly RaceCompetitor[],
  entries: readonly SeriesEntry[],
): RaceCompetitor[] {
  const entryIds = new Set(entries.map(e => e.id));
  return competitors.filter(c => !entryIds.has(c.seriesEntryId));
}


function minimalEntry(overrides: Partial<SeriesEntry> & Pick<SeriesEntry, 'id'>): SeriesEntry {
  return {
    seriesId: 's1',
    helm: 'A',
    boatClass: 'ILCA 7',
    sailNumber: 1,
    handicaps: [],
    ...overrides,
  };
}

function minimalComp(
  overrides: Partial<RaceCompetitor> & Pick<RaceCompetitor, 'id' | 'seriesEntryId' | 'raceId'>,
): RaceCompetitor {
  return new RaceCompetitor({
    seriesId: 's1',
    resultCode: 'NOT FINISHED',
    manualLaps: 0,
    ...overrides,
  });
}

describe('RaceCompetitorReader', () => {
  let fakeComps: FakeRaceCompetitorStore;
  let fakeEntries: FakeSeriesEntryStore;
  let reader: RaceCompetitorReader;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RaceCompetitorReader,
        { provide: RaceCompetitorStore, useClass: FakeRaceCompetitorStore },
        { provide: SeriesEntryStore, useClass: FakeSeriesEntryStore },
      ],
    });
    reader = TestBed.inject(RaceCompetitorReader);
    fakeComps = TestBed.inject(RaceCompetitorStore) as unknown as FakeRaceCompetitorStore;
    fakeEntries = TestBed.inject(SeriesEntryStore) as unknown as FakeSeriesEntryStore;
  });


  it('resolved list is empty while test helper surfaces join orphans', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => { /* empty */ });
    fakeComps.setCompetitors([minimalComp({ id: 'orphan', seriesEntryId: 'e-missing', raceId: 'r1' })]);
    fakeEntries.setEntries([]);
    expect(reader.selectedResolvedCompetitors()).toHaveLength(0);
    expect(
      competitorsMissingSeriesEntry(fakeComps.selectedCompetitors(), fakeEntries.selectedEntries()).map(c => c.id),
    ).toEqual(['orphan']);
  });

  it('resolvedForRace order matches filtering competitors then resolving', () => {
    fakeComps.setCompetitors([
      minimalComp({ id: 'a', seriesEntryId: 'e1', raceId: 'r2' }),
      minimalComp({ id: 'b', seriesEntryId: 'e2', raceId: 'r1' }),
      minimalComp({ id: 'c', seriesEntryId: 'e3', raceId: 'r1' }),
    ]);
    fakeEntries.setEntries([
      minimalEntry({ id: 'e1' }),
      minimalEntry({ id: 'e2', sailNumber: 2 }),
      minimalEntry({ id: 'e3', sailNumber: 3 }),
    ]);
    const byFilter = resolveRaceCompetitors(
      fakeComps.selectedCompetitors().filter(c => c.raceId === 'r1'),
      fakeEntries.selectedEntries(),
    );
    expect(reader.resolvedForRace('r1').map(r => r.id)).toEqual(byFilter.map(r => r.id));
  });

});
