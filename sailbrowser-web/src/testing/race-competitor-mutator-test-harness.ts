/**
 * Test harness for `RaceCompetitorMutator`: run the **real** mutator against
 * in-memory store fakes. `provideMutatorTestFirestore()` replaces the
 * `FIRESTORE_WRITES` entry points and applies the same converter + merge rules
 * as production (`toDbModel` + wire patch).
 *
 * - **`setDoc`** — used for single-doc race updates (`updateRaceCompetitor`);
 *   applied immediately to the harness stores.
 * - **`writeBatch`** — used for atomic multi-write paths; `commit()` flushes
 *   queued ops into the same stores.
 */
import type { Provider } from '@angular/core';
import {
  type DocumentReference,
  FieldValue,
  Firestore,
  Timestamp,
  type WriteBatch,
} from '@angular/fire/firestore';
import { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { toDbModel } from 'app/shared/firebase/firestore-helper';
import { FIRESTORE_WRITES, type FirestoreWrites } from 'app/shared/firebase/firestore-writes';
import type { afterEach } from 'vitest';

/** Minimal doc ref shape the mutator passes to writes; real refs expose `.id`. */
export interface TestDocRef { id: string; __testCollection: 'race-results' | 'series-entries' }

type WireRecord = Record<string, unknown>;

/** Apply Firestore wire values on top of App records (delete sentinel removes key; Timestamp -> Date). */
function applyFirestoreWirePatch(previous: WireRecord, data: WireRecord): WireRecord {
  const next = { ...previous };
  for (const [key, raw] of Object.entries(data)) {
    if (raw instanceof FieldValue) {
      delete next[key];
      continue;
    }
    next[key] = raw instanceof Timestamp ? raw.toDate() : raw;
  }
  return next;
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

let currentStores: MutatorTestHarnessStores | null = null;

function harnessStoresOrThrow(): MutatorTestHarnessStores {
  if (!currentStores) {
    throw new Error('RaceCompetitor mutator tests: call installMutatorWriteBatchHarness() in beforeEach.');
  }
  return currentStores;
}

/** Applies one converter output onto the in-memory doc (mirror of batch `set` merge). */
function applySet(stores: MutatorTestHarnessStores, ref: TestDocRef, converted: WireRecord): void {
  if (ref.__testCollection === 'race-results') {
    const comps = stores.raceCompetitors.comps;
    const idx = comps.findIndex(c => c.id === ref.id);
    if (idx < 0) return;
    const merged = applyFirestoreWirePatch(Object.assign({}, comps[idx] as unknown as WireRecord), converted);
    comps[idx] = new RaceCompetitor(merged as unknown as RaceCompetitor);
  } else {
    const entries = stores.seriesEntries.entries;
    const idx = entries.findIndex(e => e.id === ref.id);
    if (idx < 0) return;
    entries[idx] = applyFirestoreWirePatch({ ...entries[idx] } as WireRecord, converted) as unknown as SeriesEntry;
  }
}

async function applyDelete(stores: MutatorTestHarnessStores, ref: TestDocRef): Promise<void> {
  if (ref.__testCollection === 'race-results') {
    await stores.raceCompetitors.deleteResult(ref.id);
  } else {
    await stores.seriesEntries.deleteEntry(ref.id);
  }
}

function convert(data: unknown, merge: boolean): WireRecord {
  return toDbModel(data as Record<string, never>, merge, true) as WireRecord;
}

const testFirestoreWrites: FirestoreWrites = {
  async setDoc(ref, data, options) {
    applySet(harnessStoresOrThrow(), ref as unknown as TestDocRef, convert(data, 'merge' in options && !!options.merge));
  },
  writeBatch() {
    const stores = harnessStoresOrThrow();
    type Op = { kind: 'set'; ref: TestDocRef; data: WireRecord } | { kind: 'delete'; ref: TestDocRef };
    const ops: Op[] = [];

    const batch = {
      update(ref: unknown, data: unknown) {
        ops.push({ kind: 'set', ref: ref as TestDocRef, data: convert(data, true) });
        return batch;
      },
      set(ref: unknown, data: unknown, options?: { merge?: boolean }) {
        ops.push({ kind: 'set', ref: ref as TestDocRef, data: convert(data, options?.merge ?? false) });
        return batch;
      },
      delete(ref: unknown) {
        ops.push({ kind: 'delete', ref: ref as TestDocRef });
        return batch;
      },
      async commit() {
        for (const op of ops) {
          if (op.kind === 'delete') await applyDelete(stores, op.ref);
          else applySet(stores, op.ref, op.data);
        }
      },
    };
    return batch as unknown as WriteBatch;
  },
};

/** Providers routing the mutator's Firestore writes into the harness stores. */
export function provideMutatorTestFirestore(): Provider[] {
  return [
    { provide: Firestore, useValue: {} },
    { provide: FIRESTORE_WRITES, useValue: testFirestoreWrites },
  ];
}

/**
 * Points the fake `writeBatch` and `setDoc` at these stores for the current test.
 * Clears the ref after each test when `registerTeardown` is `afterEach`.
 */
export function installMutatorWriteBatchHarness(
  stores: MutatorTestHarnessStores,
  registerTeardown?: typeof afterEach,
): void {
  currentStores = stores;
  if (registerTeardown) {
    registerTeardown(() => {
      currentStores = null;
    });
  }
}
