/** Must load before services that import `RaceCompetitorMutator` (registers `writeBatch` mock). */
import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import {
  installMutatorWriteBatchHarness,
  MutatorTestRaceCompetitorStore,
  MutatorTestSeriesEntryStore,
} from '@testing/race-competitor-mutator-test-harness';
import { ClubStore } from 'app/club-tenant';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { Series } from 'app/race-calender/model/series';
import { DISCARD_PROFILE_CAP, discardTableFromLegacy } from 'app/scoring/model/discard-profile';
import { afterEach } from 'vitest';
import { RaceCompetitor } from '../model/race-competitor';
import { RaceCompetitorEditService } from './race-competitor-edit.service';
import { RaceCompetitorMutator } from './race-competitor-mutator';
import { RaceCompetitorStore } from './race-competitor-store';
import { SeriesEntryStore } from './series-entry-store';

class FakeRaceCalendarStore {
  series: Series[] = [];
  races: Race[] = [];
  readonly allSeries = () => this.series;
  readonly allRaces = () => this.races;
  async updateRace(raceId: string, data: Partial<Race>): Promise<void> {
    const idx = this.races.findIndex(r => r.id === raceId);
    if (idx >= 0) this.races[idx] = { ...this.races[idx], ...data } as Race;
  }
  async ensureRaceDirty(raceId: string): Promise<void> {
    const r = this.races.find(x => x.id === raceId);
    if (!r || r.dirty === true) return;
    await this.updateRace(raceId, { dirty: true });
  }
}

class FakeClubStore {
  classes: BoatClass[] = [];
  readonly club = () =>
    ({
      classes: this.classes,
      fleets: [],
    }) as unknown as ReturnType<ClubStore['club']>;
}

describe('RaceCompetitorEditService', () => {
  let service: RaceCompetitorEditService;
  let compStore: MutatorTestRaceCompetitorStore;
  let entryStore: MutatorTestSeriesEntryStore;
  let raceCalendar: FakeRaceCalendarStore;
  let clubStore: FakeClubStore;

  beforeEach(() => {
    const raceCompetitors = new MutatorTestRaceCompetitorStore();
    const seriesEntries = new MutatorTestSeriesEntryStore();
    installMutatorWriteBatchHarness({ raceCompetitors, seriesEntries }, afterEach);
    TestBed.configureTestingModule({
      providers: [
        RaceCompetitorEditService,
        { provide: RaceCompetitorStore, useValue: raceCompetitors },
        { provide: SeriesEntryStore, useValue: seriesEntries },
        { provide: RaceCalendarStore, useClass: FakeRaceCalendarStore },
        { provide: ClubStore, useClass: FakeClubStore },
        { provide: Firestore, useValue: {} },
        RaceCompetitorMutator,
      ],
    });
    service = TestBed.inject(RaceCompetitorEditService);
    compStore = raceCompetitors;
    entryStore = seriesEntries;
    raceCalendar = TestBed.inject(RaceCalendarStore) as unknown as FakeRaceCalendarStore;
    clubStore = TestBed.inject(ClubStore) as unknown as FakeClubStore;
    clubStore.classes = [];
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
    expect(
      compStore.comps.every(c => (c as unknown as { helm?: string }).helm === undefined),
    ).toBe(true);
  });

  it('clears persisted personalHandicapBand when operation band is undefined (unknown)', async () => {
    entryStore.entries = [
      {
        id: 'se-1',
        seriesId: 's1',
        helm: 'Sam',
        boatClass: 'ILCA 7',
        sailNumber: 100,
        handicaps: [],
        personalHandicapBand: 'Band2',
      },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'setPersonalHandicapBand', band: undefined },
    });

    const e = entryStore.entries[0];
    expect(e.personalHandicapBand).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(e, 'personalHandicapBand')).toBe(false);
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

  it('preserves the series entry when another race still references it', async () => {
    entryStore.entries = [
      { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
    ];
    compStore.comps = [
      new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
    ];

    await service.apply({
      competitorId: 'c1',
      operation: { type: 'deleteCompetitor' },
    });

    // c1 gone, c2 remains, entry still alive because c2 references it.
    expect(compStore.comps.map(c => c.id)).toEqual(['c2']);
    expect(entryStore.entries.find(e => e.id === 'se-1')).toBeDefined();
  });

  describe('applyEdit', () => {
    /** Build a minimal Series that requires the PY handicap scheme. */
    function pySeries(id: string): Series {
      return {
        id,
        seasonId: 'season-1',
        name: `Series ${id}`,
        archived: false,
        scoringAlgorithm: 'short',
        entryAlgorithm: 'classSailNumberHelm',
        discards: discardTableFromLegacy(99, 99, DISCARD_PROFILE_CAP),
        primaryScoringConfiguration: {
          id: 'p1',
          name: 'primary',
          fleet: { type: 'GeneralHandicap', id: 'f1', name: 'General Handicap' },
          type: 'Handicap',
          handicapScheme: 'PY',
        },
      };
    }

    function testRace(id: string, seriesId: string): Race {
      return {
        id,
        seriesId,
        seriesName: seriesId,
        fleetId: 'f1',
        index: 0,
        scheduledStart: new Date('2025-01-01T10:00:00Z'),
        raceOfDay: 1,
        type: 'Handicap',
        status: 'Completed',
        isDiscardable: true,
        isAverageLap: false,
        dirty: false,
        resultsSheetImage: '',
      };
    }

    it('applies helm, class, sail and band in one call and marks every referencing race dirty', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [
        testRace('r1', 's1'),
        testRace('r2', 's1'),
        testRace('r3', 's1'),
      ];
      entryStore.entries = [
        {
          id: 'se-1',
          seriesId: 's1',
          helm: 'Old Helm',
          boatClass: 'ILCA 6',
          sailNumber: 100,
          handicaps: [{ scheme: 'PY', value: 1100 }],
        },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
        new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
        // r3 is in the series but not referenced - must stay clean.
        new RaceCompetitor({ id: 'c3', seriesId: 's1', raceId: 'r3', seriesEntryId: 'se-other' }),
      ];

      await service.applyEdit({
        competitorId: 'c1',
        helm: 'New Helm',
        crew: '',
        crewScope: 'raceOnly',
        boatClass: 'ILCA 7',
        sailNumber: 200,
        personalHandicapBand: undefined,
      });

      const e = entryStore.entries.find(x => x.id === 'se-1')!;
      expect(e.helm).toBe('New Helm');
      expect(e.boatClass).toBe('ILCA 7');
      expect(e.sailNumber).toBe(200);
      // PY still required by series, but no class in the club list, so the
      // metadata default takes over (kept as a positive number).
      expect(e.handicaps.find(h => h.scheme === 'PY')!.value).toBeGreaterThan(0);
      // r1 + r2 touched, r3 untouched.
      expect(raceCalendar.races.find(r => r.id === 'r1')!.dirty).toBe(true);
      expect(raceCalendar.races.find(r => r.id === 'r2')!.dirty).toBe(true);
      expect(raceCalendar.races.find(r => r.id === 'r3')!.dirty).toBe(false);
    });

    it('recomputes PY from the new club class when boat class changes', async () => {
      clubStore.classes = [
        { id: 'ilca6', name: 'ILCA 6', handicaps: [{ scheme: 'PY', value: 1165 }] },
        { id: 'ilca7', name: 'ILCA 7', handicaps: [{ scheme: 'PY', value: 1100 }] },
      ];
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        {
          id: 'se-1',
          seriesId: 's1',
          helm: 'Sam',
          boatClass: 'ILCA 6',
          sailNumber: 100,
          handicaps: [{ scheme: 'PY', value: 1165 }],
        },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      ];

      await service.applyEdit({
        competitorId: 'c1',
        helm: 'Sam',
        crew: '',
        crewScope: 'raceOnly',
        boatClass: 'ILCA 7',
        sailNumber: 100,
      });

      const e = entryStore.entries.find(x => x.id === 'se-1')!;
      expect(e.boatClass).toBe('ILCA 7');
      expect(e.handicaps.find(h => h.scheme === 'PY')!.value).toBe(1100);
    });

    it('reassociates to an existing series entry when that hull is not in this race', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
        { id: 'se-2', seriesId: 's1', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-2' }),
      ];

      await service.applyEdit({
        competitorId: 'c1',
        helm: 'Sam',
        crew: '',
        crewScope: 'raceOnly',
        boatClass: 'ILCA 7',
        sailNumber: 100,
      });

      expect(compStore.comps.find(c => c.id === 'c1')!.seriesEntryId).toBe('se-1');
      expect(entryStore.entries.some(e => e.id === 'se-2')).toBe(false);
      expect(entryStore.entries.find(e => e.id === 'se-1')!.helm).toBe('Sam');
      expect(raceCalendar.races[0].dirty).toBe(true);
    });

    it('rejects when proposed identity is already represented in this race', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
        { id: 'se-2', seriesId: 's1', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c-edit', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-2' }),
        new RaceCompetitor({ id: 'c-other', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      ];

      await expect(
        service.applyEdit({
          competitorId: 'c-edit',
          helm: 'Sam',
          crew: '',
          crewScope: 'raceOnly',
          boatClass: 'ILCA 7',
          sailNumber: 100,
        }),
      ).rejects.toThrowError(/already entered in this race/);

      expect(compStore.comps.find(c => c.id === 'c-edit')!.seriesEntryId).toBe('se-2');
      expect(entryStore.entries.find(e => e.id === 'se-2')!.helm).toBe('Bob');
      expect(raceCalendar.races[0].dirty).toBe(false);
    });

    it('rejects an in-race conflict under a merged-hull strategy', async () => {
      const s = pySeries('s1');
      s.entryAlgorithm = 'classSailNumber';
      raceCalendar.series = [s];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam',  boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
        { id: 'se-2', seriesId: 's1', helm: 'Jane', boatClass: 'ILCA 7', sailNumber: 200, handicaps: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
        new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-2' }),
      ];

      // Swap Jane's sail number to Sam's hull - same hull in one race.
      await expect(
        service.applyEdit({
          competitorId: 'c2',
          helm: 'Jane',
          crew: '',
          crewScope: 'raceOnly',
          boatClass: 'ILCA 7',
          sailNumber: 100,
        }),
      ).rejects.toThrowError(/would conflict/);

      expect(entryStore.entries.find(e => e.id === 'se-2')!.sailNumber).toBe(200);
    });

    it('raceOnly crew edit only marks the current race dirty', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1'), testRace('r2', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam', crew: 'Alice', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
        new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
      ];

      await service.applyEdit({
        competitorId: 'c1',
        helm: 'Sam',
        crew: 'Bob',
        crewScope: 'raceOnly',
        boatClass: 'ILCA 7',
        sailNumber: 100,
      });

      // Entry crew is unchanged; override recorded on r1 only.
      expect(entryStore.entries[0].crew).toBe('Alice');
      expect(compStore.comps.find(c => c.id === 'c1')!.crewOverride).toBe('Bob');
      expect(compStore.comps.find(c => c.id === 'c2')!.crewOverride).toBeUndefined();
      expect(raceCalendar.races.find(r => r.id === 'r1')!.dirty).toBe(true);
      expect(raceCalendar.races.find(r => r.id === 'r2')!.dirty).toBe(false);
    });

    it('wholeSeries crew edit writes to the entry and marks all referencing races dirty', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1'), testRace('r2', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam', crew: 'Alice', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
        new RaceCompetitor({
          id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1', crewOverride: 'Bob',
        }),
      ];

      await service.applyEdit({
        competitorId: 'c1',
        helm: 'Sam',
        crew: 'Bob',
        crewScope: 'wholeSeries',
        boatClass: 'ILCA 7',
        sailNumber: 100,
      });

      expect(entryStore.entries[0].crew).toBe('Bob');
      // The override that now matches the new entry crew is dropped.
      expect(compStore.comps.find(c => c.id === 'c2')!.crewOverride).toBeUndefined();
      expect(raceCalendar.races.find(r => r.id === 'r1')!.dirty).toBe(true);
      expect(raceCalendar.races.find(r => r.id === 'r2')!.dirty).toBe(true);
    });

    it('does not mark anything dirty when nothing actually changed', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        {
          id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100,
          handicaps: [{ scheme: 'PY', value: 1100 }],
        },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      ];

      await service.applyEdit({
        competitorId: 'c1',
        helm: 'Sam',
        crew: '',
        crewScope: 'raceOnly',
        boatClass: 'ILCA 7',
        sailNumber: 100,
      });

      expect(raceCalendar.races[0].dirty).toBe(false);
    });
  });
});
