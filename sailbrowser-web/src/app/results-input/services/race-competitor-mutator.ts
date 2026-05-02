/**
 * Aggregate mutations for RaceCompetitor + SeriesEntry: race-scoped vs series-scoped
 * updates, repoint, delete with orphan cleanup, batched per-race writes,
 * and structural enforcement of the per-hull uniqueness invariant.
 */
import { inject, Injectable } from '@angular/core';
import { Firestore, writeBatch } from '@angular/fire/firestore';
import { RaceCalendarStore } from 'app/race-calender';
import { Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { ResultCode } from 'app/scoring/model/result-code';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { deleteField } from 'firebase/firestore';
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

export interface SeriesEntryPatch {
  helm?: string;
  crew?: string;
  boatClass?: string;
  sailNumber?: number;
  handicaps?: Handicap[];
  personalHandicapBand?: PersonalHandicapBand | null;
  tags?: string[] | null;
}

export interface CreateSeriesEntryInput {
  seriesId: string;
  helm: string;
  boatClass: string;
  sailNumber: number;
  crew?: string;
  handicaps: Handicap[];
  personalHandicapBand?: PersonalHandicapBand;
  tags?: string[];
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

const ENTRY_PATCH_KEYS: (keyof SeriesEntryPatch)[] = [
  'helm',
  'crew',
  'boatClass',
  'sailNumber',
  'handicaps',
  'personalHandicapBand',
  'tags',
];

/** Identity-relevant fields whose change requires uniqueness validation. */
const IDENTITY_KEYS: (keyof SeriesEntryPatch)[] = ['helm', 'boatClass', 'sailNumber'];

/**
 * Build Firestore update data:
 *   key absent  -> field not touched
 *   value null  -> deleteField()
 *   else        -> set
 */
export function firestoreDataFromRacePatch(patch: RaceScopedCompetitorPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of RACE_PATCH_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    out[k] = v === null ? deleteField() : v;
  }
  return out;
}

function firestoreDataFromEntryPatch(patch: SeriesEntryPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ENTRY_PATCH_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    out[k] = v === null ? deleteField() : v;
  }
  return out;
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

  async updateRaceCompetitor(competitorId: string, patch: RaceScopedCompetitorPatch): Promise<void> {
    const data = firestoreDataFromRacePatch(patch);
    if (Object.keys(data).length === 0) return;

    await this.runInBatch(batch => {
      batch.update(this.raceCompetitors.raceResultDocRef(competitorId), data);
    });

    const comp = this.raceCompetitors.selectedCompetitors().find(c => c.id === competitorId);
    if (comp) {
      await this.raceCalendar.ensureRaceDirty(comp.raceId);
    }
  }

  /**
   * Per-row race-scoped patches for one race in one atomic batch.
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
        const data = firestoreDataFromRacePatch(patch);
        if (Object.keys(data).length === 0) continue;
        wroteAny = true;
        batch.update(this.raceCompetitors.raceResultDocRef(competitorId), data);
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

  async updateSeriesEntryForCompetitor(competitorId: string, patch: SeriesEntryPatch): Promise<void> {
    const comp = this.raceCompetitors.selectedCompetitors().find(c => c.id === competitorId);
    if (!comp) {
      throw new ScoreSmarterError(`RaceCompetitorMutator: competitor ${competitorId} not found in selection`);
    }
    await this.updateSeriesEntryById(comp.seriesEntryId, patch);
  }

  /**
   * Direct series entry update by id. Identity-changing patches are validated
   * against all current entries in the series.
   */
  async updateSeriesEntryById(entryId: string, patch: SeriesEntryPatch): Promise<void> {
    const data = firestoreDataFromEntryPatch(patch);
    if (Object.keys(data).length === 0) return;

    if (this.touchesIdentity(patch)) {
      const current = await this.seriesEntries.getSeriesEntry(entryId);
      if (!current) {
        throw new ScoreSmarterError(
          `RaceCompetitorMutator: series entry ${entryId} not found while validating identity update.`,
        );
      }
      const proposed: PerHullIdentity = {
        helm: patch.helm ?? current.helm,
        boatClass: patch.boatClass ?? current.boatClass,
        sailNumber: patch.sailNumber ?? current.sailNumber,
      };
      const sameSeries = await this.seriesEntries.getSeriesEntries(current.seriesId);
      const collision = findCollidingEntry(sameSeries, proposed, entryId);
      if (collision) {
        throw new SeriesEntryIdentityConflictError(collision.id, current.seriesId, proposed);
      }
    }

    await this.runInBatch(batch => {
      batch.update(this.seriesEntries.seriesEntryDocRef(entryId), data);
    });

    const refs = await this.raceCompetitors.getCompetitorsForSeriesEntry(entryId);
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
      batch.update(this.raceCompetitors.raceResultDocRef(competitor.id), { seriesEntryId: nextSeriesEntryId });
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

  private touchesIdentity(patch: SeriesEntryPatch): boolean {
    return IDENTITY_KEYS.some(k => k in patch);
  }

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
