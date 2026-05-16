/** Must load before `RaceCompetitorMutator` (registers `writeBatch` mock). */
import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import {
  installMutatorWriteBatchHarness,
  MutatorTestRaceCompetitorStore,
  MutatorTestSeriesEntryStore,
} from '@testing/race-competitor-mutator-test-harness';
import { RaceCalendarStore } from 'app/race-calender';
import { Race } from 'app/race-calender/model/race';
import { afterEach } from 'vitest';
import { RaceCompetitor } from '../model/race-competitor';
import type { SeriesEntry } from '../model/series-entry';
import { RaceCompetitorMutator, SeriesEntryIdentityConflictError } from './race-competitor-mutator';
import { RaceCompetitorStore } from './race-competitor-store';
import { SeriesEntryStore } from './series-entry-store';

class StubRaceCalendar {
  ensured: string[] = [];
  races: Race[] = [];
  async ensureRaceDirty(raceId: string): Promise<void> {
    this.ensured.push(raceId);
  }
}

describe('RaceCompetitorMutator behaviour (.harness)', () => {
  let mutator: RaceCompetitorMutator;
  let compStore: MutatorTestRaceCompetitorStore;
  let entryStore: MutatorTestSeriesEntryStore;
  let calendars: StubRaceCalendar;

  beforeEach(() => {
    const raceCompetitors = new MutatorTestRaceCompetitorStore();
    const seriesEntries = new MutatorTestSeriesEntryStore();
    installMutatorWriteBatchHarness({ raceCompetitors, seriesEntries }, afterEach);

    calendars = new StubRaceCalendar();

    TestBed.configureTestingModule({
      providers: [
        RaceCompetitorMutator,
        { provide: RaceCompetitorStore, useValue: raceCompetitors },
        { provide: SeriesEntryStore, useValue: seriesEntries },
        { provide: RaceCalendarStore, useValue: calendars },
        { provide: Firestore, useValue: {} },
      ],
    });
    mutator = TestBed.inject(RaceCompetitorMutator);
    compStore = raceCompetitors;
    entryStore = seriesEntries;
  });

  describe('updateSeriesEntryFromEdit', () => {
    const basePrevious = (): (typeof entryStore.entries)[0] => ({
      id: 'se-1',
      seriesId: 's1',
      helm: 'Sam',
      boatClass: 'ILCA 7',
      sailNumber: 100,
      handicaps: [],
      tags: [],
    });

    it('is a no-op when nothing changed — no duplicate batch side effects assumed', async () => {
      entryStore.entries = [basePrevious()];
      calendars.ensured = [];
      await mutator.updateSeriesEntryFromEdit(entryStore.entries[0], { ...entryStore.entries[0] });
      expect(calendars.ensured).toHaveLength(0);
    });

    it('clearing personalHandicapBand removes the stored field via deleteField()', async () => {
      entryStore.entries = [{ ...basePrevious(), personalHandicapBand: 'Band1' }];
      const prev = entryStore.entries[0];
      const next = { ...prev, personalHandicapBand: null } as unknown as SeriesEntry;

      await mutator.updateSeriesEntryFromEdit(prev, next);

      const e = entryStore.entries.find(x => x.id === 'se-1')!;
      expect(e.personalHandicapBand).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(e, 'personalHandicapBand')).toBe(false);
    });

    it('throws SeriesEntryIdentityConflictError when helm/class/sail would collide', async () => {
      entryStore.entries = [
        basePrevious(),
        {
          id: 'se-2',
          seriesId: 's1',
          helm: 'Bob',
          boatClass: 'ILCA 7',
          sailNumber: 200,
          handicaps: [],
          tags: [],
        },
      ];
      const prev = entryStore.entries[1];
      const nextBobToSam100 = {
        ...prev,
        helm: 'Sam',
        boatClass: 'ILCA 7',
        sailNumber: 100,
      };

      await expect(mutator.updateSeriesEntryFromEdit(prev, nextBobToSam100)).rejects.toThrow(
        SeriesEntryIdentityConflictError,
      );
      expect(entryStore.entries.find(e => e.id === 'se-2')!.helm).toBe('Bob');
    });

    it('marks every race referencing the entry dirty via ensureRaceDirty', async () => {
      entryStore.entries = [basePrevious()];
      compStore.comps = [
        new RaceCompetitor({ id: 'c1', seriesId: 's1', raceId: 'r1', seriesEntryId: 'se-1' }),
        new RaceCompetitor({ id: 'c2', seriesId: 's1', raceId: 'r2', seriesEntryId: 'se-1' }),
      ];

      calendars.ensured = [];
      const prev = entryStore.entries[0];
      await mutator.updateSeriesEntryFromEdit(prev, { ...prev, helm: 'Pat' });

      expect(new Set(calendars.ensured)).toEqual(new Set(['r1', 'r2']));
    });
  });

  describe('updateRaceCompetitorsBulk', () => {
    it('merging explicit null clears an optional competitor field', async () => {
      entryStore.entries = [{ id: 'se-1', seriesId: 's1', helm: 'Sam', boatClass: 'ILCA 7', sailNumber: 100, handicaps: [], tags: [] }];
      compStore.comps = [
        new RaceCompetitor({
          id: 'c1',
          seriesId: 's1',
          raceId: 'r99',
          seriesEntryId: 'se-1',
          manualPosition: 2,
          manualLaps: 3,
        }),
      ];
      calendars.ensured = [];

      await mutator.updateRaceCompetitorsBulk('r99', [
        { competitorId: 'c1', patch: { manualPosition: null } },
      ]);

      const c = compStore.comps.find(x => x.id === 'c1')!;
      expect(c.manualPosition).toBeUndefined();
      expect(calendars.ensured).toContain('r99');
    });

    it('omits absent fields / undefined patch values — no unintended clears', async () => {
      compStore.comps = [
        new RaceCompetitor({
          id: 'c1',
          seriesId: 's1',
          raceId: 'r99',
          seriesEntryId: 'se-1',
          manualPosition: 4,
          manualLaps: 5,
          resultCode: 'OK',
        }),
      ];

      await mutator.updateRaceCompetitorsBulk('r99', [
        // manualPosition intentionally absent
        { competitorId: 'c1', patch: {} },
      ]);

      expect(compStore.comps.find(c => c.id === 'c1')!.manualPosition).toBe(4);
    });
  });

  describe('updateRaceCompetitor', () => {
    it('supports the same merge contract as bulk', async () => {
      compStore.comps = [
        new RaceCompetitor({
          id: 'c1',
          seriesId: 's1',
          raceId: 'r7',
          seriesEntryId: 'se-1',
          manualFinishTime: new Date('2025-06-01T12:00:00Z'),
        }),
      ];

      await mutator.updateRaceCompetitor('c1', { manualFinishTime: null });

      expect(compStore.comps.find(c => c.id === 'c1')!.manualFinishTime).toBeUndefined();
    });
  });
});
