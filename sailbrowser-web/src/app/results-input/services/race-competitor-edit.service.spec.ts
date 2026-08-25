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
import { calculatePersonalHandicapFromPy } from 'app/scoring/model/personal-handicap';
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

  function pySeries(id: string): Series {
    return {
      id,
      seasonId: 'season-1',
      name: `Series ${id}`,
      archived: false,
      scoringAlgorithm: 'short',
      entryAlgorithm: 'classSailNumberHelm',
      discards: [99],
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

  describe('deleteRaceCompetitor', () => {
    it('deletes orphaned series entry after deleting last competitor', async () => {
      raceCalendar.series = [pySeries('s1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Old', boatClass: 'ILCA 7', sailNumber: '123', handicaps: [], divisions: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      ];

      await service.deleteRaceCompetitor('c1');

      expect(compStore.comps.length).toBe(0);
      expect(entryStore.entries.find(e => e.id === 'se-1')).toBeUndefined();
    });

    it('preserves the series entry when another race still references it', async () => {
      raceCalendar.series = [pySeries('s1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: '100', handicaps: [], divisions: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
        new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
      ];

      await service.deleteRaceCompetitor('c1');

      expect(compStore.comps.map(c => c.id)).toEqual(['c2']);
      expect(entryStore.entries.find(e => e.id === 'se-1')).toBeDefined();
    });
  });

  describe('applyChangeEnteredCompetitor', () => {
    it('reassociates to an existing series entry when that hull is not in this race', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: '100', handicaps: [], divisions: [] },
        { id: 'se-2', seriesId: 's1', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: '100', handicaps: [], divisions: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-2' }),
      ];

      await service.applyChangeEnteredCompetitor({
        competitorId: 'c1',
        helm: 'Sam',
        boatClass: 'ILCA 7',
        sailNumber: '100',
      });

      expect(compStore.comps.find(c => c.id === 'c1')!.seriesEntryId).toBe('se-1');
      expect(entryStore.entries.some(e => e.id === 'se-2')).toBe(false);
      expect(raceCalendar.races[0].dirty).toBe(true);
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
          sailNumber: '100',
          handicaps: [{ scheme: 'PY', value: 1165 }],
          divisions: [],
        },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      ];

      await service.applyChangeEnteredCompetitor({
        competitorId: 'c1',
        helm: 'Sam',
        boatClass: 'ILCA 7',
        sailNumber: '100',
      });

      const linked = compStore.comps.find(c => c.id === 'c1')!;
      const e = entryStore.entries.find(x => x.id === linked.seriesEntryId)!;
      expect(e.boatClass).toBe('ILCA 7');
      expect(e.handicaps.find(h => h.scheme === 'PY')!.value).toBe(1100);
    });

    it('rejects when proposed identity is already represented in this race', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: '100', handicaps: [], divisions: [] },
        { id: 'se-2', seriesId: 's1', helm: 'Bob', boatClass: 'ILCA 7', sailNumber: '100', handicaps: [], divisions: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c-edit', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-2' }),
        new RaceCompetitor({ id: 'c-other', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      ];

      await expect(
        service.applyChangeEnteredCompetitor({
          competitorId: 'c-edit',
          helm: 'Sam',
          boatClass: 'ILCA 7',
          sailNumber: '100',
        }),
      ).rejects.toThrowError(/already entered in this race/);
    });
  });

  describe('applyRaceResultData', () => {
    it('updates race-only fields and marks the race dirty', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: '100', handicaps: [], divisions: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({
          id: 'c1',
          seriesId: 's1',
          raceId: 'r1',
          seriesEntryId: 'se-1',
          manualLaps: 1,
          resultCode: 'OK',
        }),
      ];

      const finish = new Date('2025-01-01T11:00:00Z');
      await service.applyRaceResultData({
        competitorId: 'c1',
        manualFinishTime: finish,
        manualLaps: 3,
        resultCode: 'DNF',
        crewOverride: 'Bob',
      });

      const c = compStore.comps.find(x => x.id === 'c1')!;
      expect(c.manualFinishTime).toEqual(finish);
      expect(c.manualLaps).toBe(3);
      expect(c.resultCode).toBe('DNF');
      expect(c.crewOverride).toBe('Bob');
      expect(entryStore.entries[0].crew).toBeUndefined();
      expect(raceCalendar.races[0].dirty).toBe(true);
    });
  });

  describe('applySeriesTypo', () => {
    it('renames helm in place on the same series entry (no repoint)', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1'), testRace('r2', 's1')];
      entryStore.entries = [
        {
          id: 'se-1',
          seriesId: 's1',
          helm: 'Fred Blogggs',
          boatClass: 'ILCA 7',
          sailNumber: '100',
          handicaps: [{ scheme: 'PY', value: 1100 }],
          divisions: [],
        },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
        new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
      ];

      await service.applySeriesTypo({
        competitorId: 'c1',
        helm: 'Fred Bloggs',
      });

      expect(entryStore.entries.length).toBe(1);
      expect(entryStore.entries[0].id).toBe('se-1');
      expect(entryStore.entries[0].helm).toBe('Fred Bloggs');
      expect(compStore.comps.every(c => c.seriesEntryId === 'se-1')).toBe(true);
      expect(raceCalendar.races.find(r => r.id === 'r1')!.dirty).toBe(true);
      expect(raceCalendar.races.find(r => r.id === 'r2')!.dirty).toBe(true);
    });

    it('updates helm on the series entry and marks all referencing races dirty', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1'), testRace('r2', 's1')];
      entryStore.entries = [
        {
          id: 'se-1',
          seriesId: 's1',
          helm: 'Old Helm',
          boatClass: 'ILCA 7',
          sailNumber: '100',
          handicaps: [{ scheme: 'PY', value: 1100 }],
          divisions: [],
        },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
        new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
      ];

      await service.applySeriesTypo({
        competitorId: 'c1',
        helm: 'New Helm',
        crew: 'Crew A',
      });

      expect(entryStore.entries[0].helm).toBe('New Helm');
      expect(entryStore.entries[0].crew).toBe('Crew A');
      expect(raceCalendar.races.find(r => r.id === 'r1')!.dirty).toBe(true);
      expect(raceCalendar.races.find(r => r.id === 'r2')!.dirty).toBe(true);
    });

    it('refuses in-place helm rename when another series entry already has that identity', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        { id: 'se-1', seriesId: 's1', helm: 'Fred Blogggs', boatClass: 'ILCA 7', sailNumber: '100', handicaps: [], divisions: [] },
        { id: 'se-2', seriesId: 's1', helm: 'Fred Bloggs', boatClass: 'ILCA 7', sailNumber: '100', handicaps: [], divisions: [] },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      ];

      await expect(
        service.applySeriesTypo({ competitorId: 'c1', helm: 'Fred Bloggs' }),
      ).rejects.toThrowError(/Cannot update/);

      expect(entryStore.entries.find(e => e.id === 'se-1')?.helm).toBe('Fred Blogggs');
      expect(compStore.comps[0].seriesEntryId).toBe('se-1');
    });

    it('recomputes Personal handicap from PY when personal band changes', async () => {
      clubStore.classes = [
        { id: 'ilca7', name: 'ILCA 7', handicaps: [{ scheme: 'PY', value: 1100 }] },
      ];
      const s = pySeries('s1');
      s.primaryScoringConfiguration = {
        ...s.primaryScoringConfiguration,
        handicapScheme: 'Personal',
        type: 'Handicap',
      } as Series['primaryScoringConfiguration'];
      raceCalendar.series = [s];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [
        {
          id: 'se-1',
          seriesId: 's1',
          helm: 'Sam',
          boatClass: 'ILCA 7',
          sailNumber: '100',
          handicaps: [{ scheme: 'PY', value: 1100 }],
          divisions: [],
        },
      ];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
      ];

      await service.applySeriesTypo({
        competitorId: 'c1',
        helm: 'Sam',
        personalHandicapBand: 'Band2',
      });

      const updated = entryStore.entries[0];
      expect(updated.personalHandicapBand).toBe('Band2');
      const personal = updated.handicaps?.find(h => h.scheme === 'Personal');
      expect(personal?.value).toBe(calculatePersonalHandicapFromPy(1100, 'Band2'));
    });
  });
});
