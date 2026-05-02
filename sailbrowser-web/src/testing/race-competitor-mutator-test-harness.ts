/**
 * Test harness for `RaceCompetitorMutator`: run the **real** mutator against
 * in-memory store fakes. `writeBatch` and `setDoc` cannot be `vi.spyOn`’d in
 * ESM (namespace not configurable), so we replace them via
 * `vi.mock('@angular/fire/firestore')` and apply the same converter + merge
 * rules as production (`toDbModel` + `applyFirestoreWirePatch`).
 *
 * - **`setDoc`** — used for single-doc race updates (`updateRaceCompetitor`);
 *   applied immediately to the harness stores.
 * - **`writeBatch`** — used for atomic multi-write paths; `commit()` flushes
 *   queued ops into the same stores.
 *
 * **Import this module before any file that pulls in `RaceCompetitorMutator`**
 * (e.g. before `race-competitor-edit.service` / `entry.service`) so the mock
 * is registered first.
 */
import type { DocumentReference } from '@angular/fire/firestore';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { FieldValue, Timestamp } from '@angular/fire/firestore';
import { afterEach, vi } from 'vitest';

/** Minimal doc ref shape the mutator passes to `writeBatch`; real refs expose `.id`. */
export interface TestDocRef { id: string; __testCollection: 'race-results' | 'series-entries' }

function isDeleteFieldValue(v: unknown): boolean {
  return v instanceof FieldValue;
}

/** Apply Firestore wire values on top of App records (delete sentinel removes key; Timestamp -> Date). */
function applyFirestoreWirePatch<T extends Record<string, unknown>>(previous: T, data: Record<string, unknown>): T {
  const next = { ...(previous as Record<string, unknown>) };
  for (const [key, raw] of Object.entries(data)) {
    if (isDeleteFieldValue(raw)) {
      delete next[key];
      continue;
    }
    let v = raw;
    if (v instanceof Timestamp) {
      v = v.toDate();
    }
    next[key] = v;
  }
  return next as T;
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

/** Set by `installMutatorWriteBatchHarness`; read by the mocked Firestore helpers. */
export const mutatorHarnessStores = vi.hoisted(() => ({
  current: null as MutatorTestHarnessStores | null,
}));

function harnessStoresOrThrow(): MutatorTestHarnessStores {
  const stores = mutatorHarnessStores.current;
  if (!stores) {
    throw new Error(
      'RaceCompetitor mutator tests: import the harness first and call installMutatorWriteBatchHarness() in beforeEach.',
    );
  }
  return stores;
}

/** Applies one converter output onto the in-memory doc (mirror of batch `set` merge). */
function applyConvertedFirestoreSet(
  stores: MutatorTestHarnessStores,
  ref: TestDocRef,
  converted: Record<string, unknown>,
): void {
  if (ref.__testCollection === 'race-results') {
    const idx = stores.raceCompetitors.comps.findIndex(c => c.id === ref.id);
    if (idx < 0) return;
    const prev = stores.raceCompetitors.comps[idx];
    const prevPlain = Object.assign({}, prev as unknown as Record<string, unknown>);
    const merged = applyFirestoreWirePatch(prevPlain, converted);
    stores.raceCompetitors.comps[idx] = new RaceCompetitor(
      merged as unknown as RaceCompetitor & Record<string, unknown>,
    );
  } else {
    const idx = stores.seriesEntries.entries.findIndex(e => e.id === ref.id);
    if (idx < 0) return;
    const prev = stores.seriesEntries.entries[idx] as SeriesEntry & Record<string, unknown>;
    const merged = applyFirestoreWirePatch({ ...prev } as Record<string, unknown>, converted) as Record<
      string,
      unknown
    > & { id: string };
    stores.seriesEntries.entries[idx] = merged as unknown as SeriesEntry;
  }
}

vi.mock('@angular/fire/firestore', async importOriginal => {
  const actual = await importOriginal<typeof import('@angular/fire/firestore')>();
  const { toDbModel } = await import('app/shared/firebase/firestore-helper');

  return {
    ...actual,
    setDoc: async (
      ref: unknown,
      data: Record<string, unknown>,
      options?: { merge?: boolean },
    ): Promise<void> => {
      const stores = harnessStoresOrThrow();
      const merge = options?.merge ?? false;
      const converted = merge
        ? toDbModel(data as Record<string, never>, true, true)
        : toDbModel(data as Record<string, never>, false, true);
      applyConvertedFirestoreSet(stores, ref as TestDocRef, converted as Record<string, unknown>);
    },
    writeBatch: () => {
      const stores = harnessStoresOrThrow();

      type Op =
        | { kind: 'set'; ref: TestDocRef; data: Record<string, unknown>; merge: boolean }
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
          applyConvertedFirestoreSet(stores, op.ref, op.data);
        }
      };

      const batch = {
        update(ref: unknown, data: Record<string, unknown>) {
          const converted = toDbModel(data as Record<string, never>, true, true);
          ops.push({ kind: 'set', ref: ref as TestDocRef, data: converted as Record<string, unknown>, merge: true });
          return batch as unknown as ReturnType<typeof actual.writeBatch>;
        },
        set(ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) {
          const merge = options?.merge ?? false;
          const converted = merge
            ? toDbModel(data as Record<string, never>, true, true)
            : toDbModel(data as Record<string, never>, false, true);
          ops.push({ kind: 'set', ref: ref as TestDocRef, data: converted as Record<string, unknown>, merge });
          return batch as unknown as ReturnType<typeof actual.writeBatch>;
        },
        delete(ref: unknown) {
          ops.push({ kind: 'delete', ref: ref as TestDocRef });
          return batch as unknown as ReturnType<typeof actual.writeBatch>;
        },
        commit: () => applyBatch(),
      };
      return batch as unknown as ReturnType<typeof actual.writeBatch>;
    },
  };
});

/**
 * Points the mocked `writeBatch` and `setDoc` at these stores for the current test.
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
