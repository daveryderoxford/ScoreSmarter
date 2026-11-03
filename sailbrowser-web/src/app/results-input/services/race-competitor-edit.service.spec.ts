import { provideFakeRatingLists } from 'app/system-data/services/rating-list-store.testing';
import { TestBed } from '@angular/core/testing';
import {
  installMutatorWriteBatchHarness,
  MutatorTestRaceCompetitorStore,
  MutatorTestSeriesEntryStore,
  provideMutatorTestFirestore,
} from '@testing/race-competitor-mutator-test-harness';
import { provideTestAuth } from '@testing/auth-test-provider';
import { ClubStore } from 'app/club-tenant';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import type { SeriesEntryMatchingStrategy } from 'app/entry/model/entry-grouping';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { Series } from 'app/race-calender/model/series';
import { calculatePersonalHandicapFromPy } from 'app/scoring/model/personal-handicap';
import { afterEach } from 'vitest';
import { RaceCompetitor } from '../model/race-competitor';
import { SeriesEntry } from '../model/series-entry';
import { EntryEditCommand, RaceCompetitorEditService } from './race-competitor-edit.service';
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

  function pySeries(id: string, entryAlgorithm: SeriesEntryMatchingStrategy = 'classSailNumberHelm'): Series {
    return {
      id,
      seasonId: 'season-1',
      name: `Series ${id}`,
      archived: false,
      scoringAlgorithm: 'short',
      entryAlgorithm,
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

  function entry(id: string, helm: string, boatClass: string, sailNumber: string, extra: Partial<SeriesEntry> = {}): SeriesEntry {
    return { id, seriesId: 's1', helm, boatClass, sailNumber, handicaps: [], divisions: [], ...extra };
  }

  function comp(id: string, raceId: string, seriesEntryId: string): RaceCompetitor {
    return new RaceCompetitor({ id, seriesId: 's1', raceId, seriesEntryId });
  }

  /** The Edit entry form as submitted with `changes` applied to the entry's current values. */
  function edit(competitorId: string, changes: Partial<EntryEditCommand> = {}): EntryEditCommand {
    const c = compStore.comps.find(x => x.id === competitorId)!;
    const e = entryStore.entries.find(x => x.id === c.seriesEntryId)!;
    return {
      competitorId,
      helm: e.helm,
      boatClass: e.boatClass,
      sailNumber: e.sailNumber,
      crew: e.crew ?? '',
      club: e.club ?? '',
      boatName: e.boatName ?? '',
      divisions: e.divisions,
      handicaps: [],
      ...changes,
    };
  }

  const entryOf = (competitorId: string) => {
    const c = compStore.comps.find(x => x.id === competitorId)!;
    return entryStore.entries.find(e => e.id === c.seriesEntryId)!;
  };

  beforeEach(() => {
    const raceCompetitors = new MutatorTestRaceCompetitorStore();
    const seriesEntries = new MutatorTestSeriesEntryStore();
    installMutatorWriteBatchHarness({ raceCompetitors, seriesEntries }, afterEach);
    TestBed.configureTestingModule({
      providers: [
        provideTestAuth(),
        RaceCompetitorEditService,
        { provide: RaceCompetitorStore, useValue: raceCompetitors },
        { provide: SeriesEntryStore, useValue: seriesEntries },
        { provide: RaceCalendarStore, useClass: FakeRaceCalendarStore },
        provideFakeRatingLists(),
        { provide: ClubStore, useClass: FakeClubStore },
        provideMutatorTestFirestore(),
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
      entryStore.entries = [entry('se-1', 'Old', 'ILCA 7', '123')];
      compStore.comps = [comp('c1', 'r1', 'se-1')];

      await service.deleteRaceCompetitor('c1');

      expect(compStore.comps.length).toBe(0);
      expect(entryStore.entries.find(e => e.id === 'se-1')).toBeUndefined();
    });

    it('preserves the series entry when another race still references it', async () => {
      raceCalendar.series = [pySeries('s1')];
      entryStore.entries = [entry('se-1', 'Sam', 'ILCA 7', '100')];
      compStore.comps = [comp('c1', 'r1', 'se-1'), comp('c2', 'r2', 'se-1')];

      await service.deleteRaceCompetitor('c1');

      expect(compStore.comps.map(c => c.id)).toEqual(['c2']);
      expect(entryStore.entries.find(e => e.id === 'se-1')).toBeDefined();
    });
  });

  describe('applyRaceResultData', () => {
    it('updates race-only fields and marks the race dirty', async () => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1')];
      entryStore.entries = [entry('se-1', 'Sam', 'ILCA 7', '100')];
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

  describe('applyEntryEdit', () => {
    beforeEach(() => {
      raceCalendar.series = [pySeries('s1')];
      raceCalendar.races = [testRace('r1', 's1'), testRace('r2', 's1'), testRace('r3', 's1')];
    });

    describe('without an identity change', () => {
      it('saves a capitalisation-only helm change on the shared entry without asking for a scope', async () => {
        entryStore.entries = [entry('fred', 'fred bloggs', 'ILCA 7', '100')];
        compStore.comps = [comp('c1', 'r1', 'fred'), comp('c2', 'r2', 'fred')];

        await service.applyEntryEdit(edit('c1', { helm: 'Fred Bloggs' }));

        expect(entryStore.entries).toHaveLength(1);
        expect(entryStore.entries[0].helm).toBe('Fred Bloggs');
        expect(compStore.comps.every(c => c.seriesEntryId === 'fred')).toBe(true);
        expect(raceCalendar.races.filter(r => r.dirty).map(r => r.id)).toEqual(['r1', 'r2']);
      });

      it('updates and clears non-identity fields on the entry', async () => {
        entryStore.entries = [entry('sam', 'Sam', 'ILCA 7', '100', { crew: 'Ann', boatName: 'Wave', club: 'IBRSC' })];
        compStore.comps = [comp('c1', 'r1', 'sam'), comp('c2', 'r2', 'sam')];

        await service.applyEntryEdit(edit('c1', { crew: 'Bea', boatName: '', club: 'Visitor SC' }));

        const e = entryStore.entries[0];
        expect(e.crew).toBe('Bea');
        expect(e.boatName).toBeUndefined();
        expect(e.club).toBe('Visitor SC');
      });

      it('recomputes the Personal handicap from PY when the band changes', async () => {
        clubStore.classes = [{ id: 'ilca7', name: 'ILCA 7', handicaps: [{ scheme: 'PY', value: 1100 }] }];
        const s = pySeries('s1');
        s.primaryScoringConfiguration = {
          ...s.primaryScoringConfiguration,
          handicapScheme: 'Personal',
          type: 'Handicap',
        } as Series['primaryScoringConfiguration'];
        raceCalendar.series = [s];
        entryStore.entries = [entry('sam', 'Sam', 'ILCA 7', '100', { handicaps: [{ scheme: 'PY', value: 1100 }] })];
        compStore.comps = [comp('c1', 'r1', 'sam')];

        await service.applyEntryEdit(edit('c1', { personalHandicapBand: 'Band2' }));

        const updated = entryStore.entries[0];
        expect(updated.personalHandicapBand).toBe('Band2');
        expect(updated.handicaps.find(h => h.scheme === 'Personal')?.value)
          .toBe(calculatePersonalHandicapFromPy(1100, 'Band2'));
      });
    });

    describe('class change', () => {
      beforeEach(() => {
        clubStore.classes = [
          { id: 'aero9', name: 'Aero 9', handicaps: [{ scheme: 'PY', value: 1014 }] },
          { id: 'aero7', name: 'Aero 7', handicaps: [{ scheme: 'PY', value: 1063 }] },
        ];
        entryStore.entries = [entry('fred-9', 'Fred', 'Aero 9', '2001', { handicaps: [{ scheme: 'PY', value: 1014 }] })];
        compStore.comps = [comp('c1', 'r1', 'fred-9'), comp('c2', 'r2', 'fred-9'), comp('c3', 'r3', 'fred-9')];
      });

      it('moves only this race to Aero 7 and leaves the earlier Aero 9 races and handicap unchanged', async () => {
        await service.applyEntryEdit(edit('c3', { boatClass: 'Aero 7', scope: 'race' }));

        const aero9 = entryStore.entries.find(e => e.id === 'fred-9')!;
        expect(aero9.boatClass).toBe('Aero 9');
        expect(aero9.handicaps).toEqual([{ scheme: 'PY', value: 1014 }]);
        expect(entryOf('c1').id).toBe('fred-9');
        expect(entryOf('c2').id).toBe('fred-9');

        const aero7 = entryOf('c3');
        expect(aero7.id).not.toBe('fred-9');
        expect(aero7.helm).toBe('Fred');
        expect(aero7.boatClass).toBe('Aero 7');
        expect(aero7.handicaps.find(h => h.scheme === 'PY')?.value).toBe(1063);
      });

      it('refuses to save without a scope when other races share the entry', async () => {
        await expect(service.applyEntryEdit(edit('c3', { boatClass: 'Aero 7' }))).rejects.toThrowError(
          /this race only or for every race/,
        );
        expect(entryStore.entries).toHaveLength(1);
        expect(entryStore.entries[0].boatClass).toBe('Aero 9');
      });

      it('changes every race and recalculates the handicap when applied to the series', async () => {
        await service.applyEntryEdit(edit('c3', { boatClass: 'Aero 7', scope: 'series' }));

        expect(entryStore.entries).toHaveLength(1);
        expect(entryStore.entries[0].boatClass).toBe('Aero 7');
        expect(entryStore.entries[0].handicaps.find(h => h.scheme === 'PY')?.value).toBe(1063);
        expect(compStore.comps.every(c => c.seriesEntryId === 'fred-9')).toBe(true);
      });

      it('keeps a handicap the user typed over the new class value', async () => {
        await service.applyEntryEdit(
          edit('c3', { boatClass: 'Aero 7', scope: 'race', handicaps: [{ scheme: 'PY', value: 1070 }] }),
        );

        expect(entryOf('c3').handicaps.find(h => h.scheme === 'PY')?.value).toBe(1070);
      });

      it('renames the entry in place when this is its only race', async () => {
        compStore.comps = [comp('c1', 'r1', 'fred-9')];

        await service.applyEntryEdit(edit('c1', { boatClass: 'Aero 7' }));

        expect(entryStore.entries.map(e => e.id)).toEqual(['fred-9']);
        expect(entryStore.entries[0].boatClass).toBe('Aero 7');
      });
    });

    describe('helm change', () => {
      beforeEach(() => {
        entryStore.entries = [entry('doug', 'Dough', 'ILCA 7', '100')];
        compStore.comps = [comp('c1', 'r1', 'doug'), comp('c2', 'r2', 'doug'), comp('c3', 'r3', 'doug')];
      });

      it('corrects the helm name in every race when applied to the series', async () => {
        await service.applyEntryEdit(edit('c3', { helm: 'Doug', scope: 'series' }));

        expect(entryStore.entries).toHaveLength(1);
        expect(entryStore.entries[0].helm).toBe('Doug');
        expect(compStore.comps.every(c => c.seriesEntryId === 'doug')).toBe(true);
      });

      it('records a different person for this race only and leaves the other races with Doug', async () => {
        await service.applyEntryEdit(edit('c3', { helm: 'Alex', scope: 'race' }));

        expect(entryOf('c1').helm).toBe('Dough');
        expect(entryOf('c2').helm).toBe('Dough');
        expect(entryOf('c3').helm).toBe('Alex');
        expect(entryOf('c3').id).not.toBe('doug');
      });

      it('joins an existing entry for that helm on the same boat for this race', async () => {
        entryStore.entries.push(entry('alex', 'Alex', 'ILCA 7', '100'));
        compStore.comps.push(comp('c9', 'r9', 'alex'));

        await service.applyEntryEdit(edit('c3', { helm: 'Alex', scope: 'race' }));

        expect(entryOf('c3').id).toBe('alex');
        expect(entryOf('c1').id).toBe('doug');
      });

      it('rejects a helm already sailing another boat in this race when results are grouped by helm', async () => {
        raceCalendar.series = [pySeries('s1', 'helm')];
        entryStore.entries.push(entry('alex', 'Alex', 'Aero 7', '7'));
        compStore.comps.push(comp('c9', 'r3', 'alex'));

        await expect(service.applyEntryEdit(edit('c3', { helm: 'Alex', scope: 'race' }))).rejects.toThrowError(
          /Alex is already entered in s1 - R0/,
        );
        expect(entryOf('c3').id).toBe('doug');
      });
    });

    describe('sail number change', () => {
      beforeEach(() => {
        entryStore.entries = [entry('sam', 'Sam', 'ILCA 7', '1001')];
        compStore.comps = [comp('c1', 'r1', 'sam'), comp('c2', 'r2', 'sam')];
      });

      it('merges into an existing entry for the corrected sail number when they share no race', async () => {
        entryStore.entries.push(entry('sam-101', 'Sam', 'ILCA 7', '101'));
        compStore.comps.push(comp('c3', 'r3', 'sam-101'));

        await service.applyEntryEdit(edit('c2', { sailNumber: '101', scope: 'series' }));

        expect(entryStore.entries.map(e => e.id)).toEqual(['sam-101']);
        expect(compStore.comps.every(c => c.seriesEntryId === 'sam-101')).toBe(true);
      });

      it('rejects a series correction when the corrected entry is already in one of the races', async () => {
        entryStore.entries.push(entry('sam-101', 'Sam', 'ILCA 7', '101'));
        compStore.comps.push(comp('c3', 'r1', 'sam-101'));

        await expect(
          service.applyEntryEdit(edit('c2', { sailNumber: '101', scope: 'series' })),
        ).rejects.toThrowError(/already entered in s1 - R0/);
        expect(entryStore.entries.map(e => e.id).sort()).toEqual(['sam', 'sam-101']);
        expect(entryOf('c1').id).toBe('sam');
      });

      it('rejects this-race change when that boat is already entered in this race', async () => {
        entryStore.entries.push(entry('sam-101', 'Sam', 'ILCA 7', '101'));
        compStore.comps.push(comp('c3', 'r2', 'sam-101'));

        await expect(
          service.applyEntryEdit(edit('c2', { sailNumber: '101', scope: 'race' })),
        ).rejects.toThrowError(/already entered/);
        expect(entryOf('c2').id).toBe('sam');
      });
    });
  });
});
