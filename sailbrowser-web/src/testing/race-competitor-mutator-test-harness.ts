/**
 * Test harness for `RaceCompetitorMutator`: run the **real** mutator against
 * in-memory store fakes. `writeBatch` cannot be `vi.spyOn`’d in ESM (namespace
 * not configurable), so we replace it via `vi.mock('@angular/fire/firestore')`
 * and route commits into the same store instances your tests mutate.
 *
 * **Import this module before any file that pulls in `RaceCompetitorMutator`**
 * (e.g. before `race-competitor-edit.service` / `entry.service`) so the mock
 * is registered first.
 */
import type { DocumentReference } from '@angular/fire/firestore';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { FieldValue } from 'firebase/firestore';
import { afterEach, vi } from 'vitest';

/** Minimal doc ref shape the mutator passes to `writeBatch`; real refs expose `.id`. */
export interface TestDocRef { id: string; __testCollection: 'race-results' | 'series-entries' }

function isDeleteFieldValue(v: unknown): boolean {
  return v instanceof FieldValue;
}

function materializeFirestoreUpdate(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (isDeleteFieldValue(v)) {
      out[k] = undefined;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * In-memory race-results backing store with the surface `RaceCompetitorMutator` needs.
 */
export class MutatorTestRaceCompetitorStore {
  comps: RaceCompetitor[] = [];
  readonly selectedCompetitors = () => this.comps;

  async getSeriesCompetitors(seriesId: string): Promise<RaceCompetitor[]> {
    return this.comps.filter(c => c.seriesId === seriesId);
  }

  async getCompetitorsForSeriesEntry(seriesEntryId: string): Promise<RaceCompetitor[]> {
    return this.comps.filter(c => c.seriesEntryId === seriesEntryId);
  }

  raceResultDocRef(id: string): DocumentReference<RaceCompetitor> {
    return { id, __testCollection: 'race-results' } as unknown as DocumentReference<RaceCompetitor>;
  }

  async updateResult(id: string, changes: Partial<RaceCompetitor>): Promise<void> {
    const idx = this.comps.findIndex(c => c.id === id);
    if (idx < 0) return;
    this.comps[idx] = new RaceCompetitor({ ...this.comps[idx], ...changes });
  }

  async deleteResult(id: string): Promise<void> {
    this.comps = this.comps.filter(c => c.id !== id);
  }

  async addResult(result: Partial<RaceCompetitor>): Promise<string> {
    const id = `rc-${this.comps.length + 1}`;
    this.comps.push(new RaceCompetitor({ ...(result as RaceCompetitor), id }));
    return id;
  }
}

/**
 * In-memory series-entries backing store with the surface `RaceCompetitorMutator` needs.
 */
export class MutatorTestSeriesEntryStore {
  entries: SeriesEntry[] = [];
  readonly selectedEntries = () => this.entries;

  async getSeriesEntries(seriesId: string): Promise<SeriesEntry[]> {
    return this.entries.filter(e => e.seriesId === seriesId);
  }

  async getSeriesEntry(id: string): Promise<SeriesEntry | null> {
    return this.entries.find(e => e.id === id) ?? null;
  }

  seriesEntryDocRef(id: string): DocumentReference<SeriesEntry> {
    return { id, __testCollection: 'series-entries' } as unknown as DocumentReference<SeriesEntry>;
  }

  async addEntry(entry: Partial<SeriesEntry>): Promise<string> {
    const id = `se-${this.entries.length + 1}`;
    this.entries.push({ ...(entry as SeriesEntry), id });
    return id;
  }

  async updateEntry(id: string, changes: Partial<SeriesEntry>): Promise<void> {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx < 0) return;
    this.entries[idx] = { ...this.entries[idx], ...changes } as SeriesEntry;
  }

  async deleteEntry(id: string): Promise<void> {
    this.entries = this.entries.filter(e => e.id !== id);
  }
}

export interface MutatorTestHarnessStores {
  raceCompetitors: MutatorTestRaceCompetitorStore;
  seriesEntries: MutatorTestSeriesEntryStore;
}

/** Set by `installMutatorWriteBatchHarness`; read by the mocked `writeBatch`. */
export const mutatorHarnessStores = vi.hoisted(() => ({
  current: null as MutatorTestHarnessStores | null,
}));

vi.mock('@angular/fire/firestore', async importOriginal => {
  const actual = await importOriginal<typeof import('@angular/fire/firestore')>();
  return {
    ...actual,
    writeBatch: () => {
      const stores = mutatorHarnessStores.current;
      if (!stores) {
        throw new Error(
          'RaceCompetitor mutator tests: import the harness first and call installMutatorWriteBatchHarness() in beforeEach.',
        );
      }
      type Op =
        | { kind: 'update'; ref: TestDocRef; data: Record<string, unknown> }
        | { kind: 'delete'; ref: TestDocRef };
      const ops: Op[] = [];

      const applyBatch = async () => {
        for (const op of ops) {
          if (op.kind === 'delete') {
            if (op.ref.__testCollection === 'race-results') {
              await stores.raceCompetitors.deleteResult(op.ref.id);
            } else {
              await stores.seriesEntries.deleteEntry(op.ref.id);
            }
            continue;
          }
          if (op.ref.__testCollection === 'race-results') {
            const patch = materializeFirestoreUpdate(op.data) as Partial<RaceCompetitor>;
            await stores.raceCompetitors.updateResult(op.ref.id, patch);
          } else {
            const patch = materializeFirestoreUpdate(op.data) as Partial<SeriesEntry>;
            await stores.seriesEntries.updateEntry(op.ref.id, patch);
          }
        }
      };

      const batch = {
        update(ref: unknown, data: Record<string, unknown>) {
          ops.push({ kind: 'update', ref: ref as TestDocRef, data });
          return batch as unknown as ReturnType<typeof actual.writeBatch>;
        },
        delete(ref: unknown) {
          ops.push({ kind: 'delete', ref: ref as TestDocRef });
          return batch as unknown as ReturnType<typeof actual.writeBatch>;
        },
        set: () => {
          throw new Error('Mutator test harness: batch.set is not implemented');
        },
        commit: () => applyBatch(),
      };
      return batch as unknown as ReturnType<typeof actual.writeBatch>;
    },
  };
});

/**
 * Point the mocked `writeBatch` at these stores for the current test.
 * Clears the ref after each test when `registerTeardown` is `afterEach`.
 */
export function installMutatorWriteBatchHarness(
  stores: MutatorTestHarnessStores,
  registerTeardown?: typeof afterEach,
): void {
  mutatorHarnessStores.current = stores;
  if (registerTeardown) {
    registerTeardown(() => {
      mutatorHarnessStores.current = null;
    });
  }
}
