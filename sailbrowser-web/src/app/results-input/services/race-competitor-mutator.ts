/**
 * Aggregate mutations for RaceCompetitor + SeriesEntry: race-scoped vs series-scoped
 * updates, repoint, delete with orphan cleanup, batched per-race writes,
 * and structural enforcement of the per-hull uniqueness invariant.
 *
 * **Patch contract for `RaceScopedCompetitorPatch`** (converter partial / merge rules):
 * - key absent or value `undefined` → leave unchanged
 * - value `null` → clear field (`deleteField()` via `dataObjectConverter` / class converter)
 * - otherwise → set field
 *
 * Series entry updates use `updateSeriesEntryFromEdit(previous, next)` with a full proposed
 * `SeriesEntry` so optional clears (e.g. `personalHandicapBand: null`) are explicit.
 */
import { inject, Injectable } from '@angular/core';
import { Firestore, setDoc, writeBatch } from '@angular/fire/firestore';
import { RaceCalendarStore } from 'app/race-calender';
import { Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { ResultCode } from 'app/scoring/model/result-code';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { RaceCompetitor } from '../model/race-competitor';
import { SeriesEntry } from '../model/series-entry';
import { RaceCompetitorStore } from './race-competitor-store';
import {
  describeIdentity,
  findCollidingEntry,
  PerHullIdentity,
} from './series-entry-identity';
import { SeriesEntryStore } from './series-entry-store';

/**
 * Thrown when a series-entry write would create or leave two entries with the
 * same per-hull identity in one series. Callers (sign-on, edit) decide whether
 * to surface this to the user or repoint via `repointRaceCompetitorToEntry`.
 */
export class SeriesEntryIdentityConflictError extends ScoreSmarterError {
  readonly collidingEntryId: string;
  readonly seriesId: string;
  readonly identity: PerHullIdentity;
  constructor(collidingEntryId: string, seriesId: string, identity: PerHullIdentity) {
    super(
      `Series entry conflict: ${describeIdentity(identity)} already exists in series ` +
      `${seriesId} (entry id ${collidingEntryId}).`,
    );
    this.name = 'SeriesEntryIdentityConflictError';
    this.collidingEntryId = collidingEntryId;
    this.seriesId = seriesId;
    this.identity = identity;
  }
}

export interface RaceScopedCompetitorPatch {
  crewOverride?: string | null;
  recordedFinishTime?: Date | null;
  manualFinishTime?: Date | null;
  manualLaps?: number;
  manualPosition?: number | null;
  startTime?: Date | null;
  resultCode?: ResultCode;
}

export interface CreateSeriesEntryInput {
  seriesId: string;
  helm: string;
  boatClass: string;
  sailNumber: number;
  crew?: string;
  handicaps: Handicap[];
  personalHandicapBand?: PersonalHandicapBand;
  /** Tag ids to seed on the new entry; caller passes `[]` when none. */
  tags: string[];
}

const RACE_PATCH_KEYS: (keyof RaceScopedCompetitorPatch)[] = [
  'crewOverride',
  'recordedFinishTime',
  'manualFinishTime',
  'manualLaps',
  'manualPosition',
  'startTime',
  'resultCode',
];

function mergePayloadFromRacePatch(patch: RaceScopedCompetitorPatch): Partial<RaceCompetitor> {
  const out: Partial<RaceCompetitor> = {};
  for (const k of RACE_PATCH_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k as keyof RaceScopedCompetitorPatch];
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function handicapListsEqual(a: Handicap[] | undefined, b: Handicap[] | undefined): boolean {
  const ax = [...(a ?? [])].sort((x, y) => x.scheme.localeCompare(y.scheme));
  const bx = [...(b ?? [])].sort((x, y) => x.scheme.localeCompare(y.scheme));
  if (ax.length !== bx.length) return false;
  for (let i = 0; i < ax.length; i++) {
    if (ax[i].scheme !== bx[i].scheme || ax[i].value !== bx[i].value) return false;
  }
  return true;
}

function tagListsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const ax = [...(a ?? [])].sort();
  const bx = [...(b ?? [])].sort();
  if (ax.length !== bx.length) return false;
  return ax.every((t, i) => t === bx[i]);
}

/** True when persisted entry fields match (including optional band as null vs absent). */
function seriesEntriesEqual(a: SeriesEntry, b: SeriesEntry): boolean {
  return (
    a.id === b.id &&
    a.seriesId === b.seriesId &&
    a.helm === b.helm &&
    (a.crew ?? '') === (b.crew ?? '') &&
    (a.club ?? '') === (b.club ?? '') &&
    a.boatClass === b.boatClass &&
    a.sailNumber === b.sailNumber &&
    (a.personalHandicapBand ?? null) === (b.personalHandicapBand ?? null) &&
    handicapListsEqual(a.handicaps, b.handicaps) &&
    tagListsEqual(a.tags, b.tags)
  );
}

@Injectable({ providedIn: 'root' })
export class RaceCompetitorMutator {
  private readonly firestore = inject(Firestore);
  private readonly raceCompetitors = inject(RaceCompetitorStore);
  private readonly seriesEntries = inject(SeriesEntryStore);
  private readonly raceCalendar = inject(RaceCalendarStore);

  private async runInBatch(work: (batch: ReturnType<typeof writeBatch>) => void | Promise<void>): Promise<void> {
    const batch = writeBatch(this.firestore);
    await Promise.resolve(work(batch));
    await batch.commit();
  }

  // --- Race-scoped writes ----------------------------------------------------

  /**
   * Single merge write: `setDoc` is enough (no transaction with other docs).
   * Multi-row updates use `writeBatch` in `updateRaceCompetitorsBulk`.
   */
  async updateRaceCompetitor(competitorId: string, patch: RaceScopedCompetitorPatch): Promise<void> {
    const mergePayload = mergePayloadFromRacePatch(patch);
    if (Object.keys(mergePayload).length === 0) return;

    await setDoc(
      this.raceCompetitors.raceResultDocRef(competitorId),
      mergePayload as RaceCompetitor,
      { merge: true },
    );

    const comp = this.raceCompetitors.selectedCompetitors().find(c => c.id === competitorId);
    if (comp) {
      await this.raceCalendar.ensureRaceDirty(comp.raceId);
    }
  }

  /**
   * Per-row race-scoped merges for one race in one atomic batch.
   * Validates each competitor belongs to `raceId`.
   */
  async updateRaceCompetitorsBulk(
    raceId: string,
    rows: { competitorId: string; patch: RaceScopedCompetitorPatch }[],
  ): Promise<void> {
    if (rows.length === 0) return;

    const selected = this.raceCompetitors.selectedCompetitors();
    let wroteAny = false;
    await this.runInBatch(batch => {
      for (const { competitorId, patch } of rows) {
        const comp = selected.find(c => c.id === competitorId);
        if (!comp || comp.raceId !== raceId) {
          throw new ScoreSmarterError(
            `RaceCompetitorMutator: competitor ${competitorId} not in race ${raceId} or not in current selection.`,
          );
        }
        const mergePayload = mergePayloadFromRacePatch(patch);
        if (Object.keys(mergePayload).length === 0) continue;
        wroteAny = true;
        batch.set(this.raceCompetitors.raceResultDocRef(competitorId), mergePayload as RaceCompetitor, {
          merge: true,
        });
      }
    });

    if (wroteAny) {
      await this.raceCalendar.ensureRaceDirty(raceId);
    }
  }

  // --- Series-entry writes (per-hull uniqueness enforced) --------------------

  /**
   * Create a SeriesEntry, refusing if another entry in the same series already
   * has the same per-hull identity.
   */
  async createSeriesEntry(input: CreateSeriesEntryInput): Promise<string> {
    const identity: PerHullIdentity = {
      helm: input.helm,
      boatClass: input.boatClass,
      sailNumber: input.sailNumber,
    };
    await this.assertIdentityFreeInSeries(input.seriesId, identity);

    const entry: Partial<SeriesEntry> = {
      seriesId: input.seriesId,
      helm: input.helm,
      boatClass: input.boatClass,
      sailNumber: input.sailNumber,
      crew: input.crew,
      handicaps: input.handicaps,
      personalHandicapBand: input.personalHandicapBand,
      tags: input.tags,
    };
    return await this.seriesEntries.addEntry(entry);
  }

  /**
   * Writes the full proposed `SeriesEntry` with merge semantics. Identity-changing
   * updates are validated against all current entries in the series.
   */
  async updateSeriesEntryFromEdit(previous: SeriesEntry, next: SeriesEntry): Promise<void> {
    if (previous.id !== next.id) {
      throw new ScoreSmarterError(
        `RaceCompetitorMutator.updateSeriesEntryFromEdit: entry id mismatch ${previous.id} vs ${next.id}.`,
      );
    }
    if (previous.seriesId !== next.seriesId) {
      throw new ScoreSmarterError(
        `RaceCompetitorMutator.updateSeriesEntryFromEdit: cannot change seriesId for entry ${previous.id}.`,
      );
    }
    if (seriesEntriesEqual(previous, next)) return;

    const identityChanged =
      previous.helm !== next.helm ||
      previous.boatClass !== next.boatClass ||
      previous.sailNumber !== next.sailNumber;

    if (identityChanged) {
      const proposed: PerHullIdentity = {
        helm: next.helm,
        boatClass: next.boatClass,
        sailNumber: next.sailNumber,
      };
      const sameSeries = await this.seriesEntries.getSeriesEntries(previous.seriesId);
      const collision = findCollidingEntry(sameSeries, proposed, previous.id);
      if (collision) {
        throw new SeriesEntryIdentityConflictError(collision.id, previous.seriesId, proposed);
      }
    }

    const { id: _omitId, ...payload } = next;

    await this.runInBatch(batch => {
      batch.set(this.seriesEntries.seriesEntryDocRef(previous.id), payload as SeriesEntry, { merge: true });
    });

    const refs = await this.raceCompetitors.getCompetitorsForSeriesEntry(previous.id);
    const raceIds = [...new Set(refs.map(c => c.raceId))];
    for (const rid of raceIds) {
      await this.raceCalendar.ensureRaceDirty(rid);
    }
  }

  // --- Delete / repoint ------------------------------------------------------

  async deleteRaceCompetitor(competitor: RaceCompetitor): Promise<void> {
    const seriesEntryId = competitor.seriesEntryId;

    const others = (await this.raceCompetitors.getCompetitorsForSeriesEntry(seriesEntryId)).filter(
      c => c.id !== competitor.id,
    );

    await this.runInBatch(batch => {
      batch.delete(this.raceCompetitors.raceResultDocRef(competitor.id));
      if (others.length === 0) {
        batch.delete(this.seriesEntries.seriesEntryDocRef(seriesEntryId));
      }
    });

    await this.raceCalendar.ensureRaceDirty(competitor.raceId);
  }

  async repointRaceCompetitorToEntry(
    competitor: RaceCompetitor,
    nextSeriesEntryId: string,
    options?: { cleanupOldEntry?: 'ifOrphan' | 'never' },
  ): Promise<void> {
    const cleanup = options?.cleanupOldEntry ?? 'ifOrphan';
    const oldEntryId = competitor.seriesEntryId;

    const target = await this.seriesEntries.getSeriesEntry(nextSeriesEntryId);
    if (!target) {
      throw new ScoreSmarterError(
        `RaceCompetitorMutator: target series entry ${nextSeriesEntryId} not found.`,
      );
    }
    if (target.seriesId !== competitor.seriesId) {
      throw new ScoreSmarterError(
        `RaceCompetitorMutator: target series entry ${nextSeriesEntryId} is in series ` +
        `${target.seriesId}, expected ${competitor.seriesId}.`,
      );
    }

    const othersOnOld = (await this.raceCompetitors.getCompetitorsForSeriesEntry(oldEntryId)).filter(
      c => c.id !== competitor.id,
    );

    await this.runInBatch(batch => {
      batch.set(
        this.raceCompetitors.raceResultDocRef(competitor.id),
        { seriesEntryId: nextSeriesEntryId } as RaceCompetitor,
        { merge: true },
      );
      if (cleanup === 'ifOrphan' && othersOnOld.length === 0) {
        batch.delete(this.seriesEntries.seriesEntryDocRef(oldEntryId));
      }
    });

    await this.raceCalendar.ensureRaceDirty(competitor.raceId);
  }

  /** Deletes a series-entry doc if no race-results still reference it. */
  async cleanupOrphanedSeriesEntry(seriesEntryId: string, options?: { excludeCompetitorId?: string }): Promise<void> {
    const comps = await this.raceCompetitors.getCompetitorsForSeriesEntry(seriesEntryId);
    const remaining = options?.excludeCompetitorId
      ? comps.filter(c => c.id !== options.excludeCompetitorId)
      : comps;
    if (remaining.length > 0) return;

    await this.runInBatch(batch => {
      batch.delete(this.seriesEntries.seriesEntryDocRef(seriesEntryId));
    });
  }

  // --- Internal helpers ------------------------------------------------------

  private async assertIdentityFreeInSeries(seriesId: string, identity: PerHullIdentity): Promise<void> {
    const entries = await this.seriesEntries.getSeriesEntries(seriesId);
    const collision = findCollidingEntry(entries, identity);
    if (collision) {
      throw new SeriesEntryIdentityConflictError(collision.id, seriesId, identity);
    }
  }
}

/** Identifier helper retained for callers that need to mint ids outside the mutator. */
export function generateSeriesEntryId(boatClass: string, sailNumber: number): string {
  return generateSecureID(10000, `SE-${boatClass}-${sailNumber}`);
}
