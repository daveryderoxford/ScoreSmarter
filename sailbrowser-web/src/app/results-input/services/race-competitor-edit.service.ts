import { inject, Injectable } from '@angular/core';
import { SeriesEntryStore } from './series-entry-store';
import { RaceCompetitorStore } from './race-competitor-store';
import { Handicap, getHandicapValue } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { RaceCompetitor } from '../model/race-competitor';
import { SeriesEntry } from '../model/series-entry';
import {
  PerHullIdentity,
  describeIdentity,
  findCollidingEntry,
} from './series-entry-identity';

/**
 * Per-race overrides are now intentionally minimal. Only `crew` may differ
 * between races for the same hull (handled via `RaceCompetitor.crewOverride`).
 * Every other piece of identity / boat / handicap data lives on the
 * `SeriesEntry` and is therefore inherently series-wide.
 */
export type CrewEditScope = 'raceOnly' | 'wholeSeries';

export type EditOperation =
  | { type: 'setHelm'; value: string }
  | { type: 'setCrew'; value: string; scope: CrewEditScope }
  | { type: 'setBoatClass'; value: string }
  | { type: 'setSailNumber'; value: number }
  | { type: 'setHandicap'; scheme: Handicap['scheme']; value: number }
  | { type: 'setPersonalHandicapBand'; band: PersonalHandicapBand | undefined }
  | { type: 'deleteCompetitor' };

export interface EditRaceCompetitorCommand {
  competitorId: string;
  operation: EditOperation;
}

/**
 * Applies edit commands originating from the per-race UI. Logic intentionally
 * isolates per-race scope (only the crew field) from per-hull scope (everything
 * else); see `EditOperation` for the strict allowed shapes.
 */
@Injectable({ providedIn: 'root' })
export class RaceCompetitorEditService {
  private readonly competitors = inject(RaceCompetitorStore);
  private readonly seriesEntries = inject(SeriesEntryStore);

  async apply(command: EditRaceCompetitorCommand): Promise<void> {
    const target = this.competitors.selectedCompetitors().find(c => c.id === command.competitorId);
    if (!target) {
      throw new Error(`Competitor not found: ${command.competitorId}`);
    }
    const entry = this.seriesEntries.selectedEntries().find(e => e.id === target.seriesEntryId);
    if (!entry) {
      throw new Error(`SeriesEntry ${target.seriesEntryId} not found for competitor ${target.id}`);
    }

    switch (command.operation.type) {
      case 'deleteCompetitor':
        await this.deleteCompetitor(target);
        return;
      case 'setCrew':
        await this.applyCrew(target, entry, command.operation);
        return;
      case 'setHelm':
      case 'setBoatClass':
      case 'setSailNumber':
      case 'setHandicap':
      case 'setPersonalHandicapBand':
        await this.applyEntryChange(entry, command.operation);
        return;
    }
  }

  private async applyCrew(
    target: RaceCompetitor,
    entry: SeriesEntry,
    op: Extract<EditOperation, { type: 'setCrew' }>,
  ): Promise<void> {
    const trimmed = op.value.trim();
    if (op.scope === 'raceOnly') {
      // crewOverride === undefined means "use entry crew"; we keep the empty
      // string as an explicit override that clears the entry crew for this race.
      const next = trimmed === (entry.crew ?? '') ? undefined : trimmed;
      if ((target.crewOverride ?? null) === (next ?? null)) return;
      await this.competitors.updateResult(target.id, { crewOverride: next });
      return;
    }

    if ((entry.crew ?? '') !== trimmed) {
      await this.seriesEntries.updateEntry(entry.id, { crew: trimmed });
    }
    // Wholeseries: drop any per-race overrides for this entry that now match
    // the new entry crew. We deliberately do NOT touch overrides that still
    // diverge from the new entry crew.
    const allForEntry = this.competitors.selectedCompetitors().filter(c => c.seriesEntryId === entry.id);
    for (const comp of allForEntry) {
      if (comp.crewOverride !== undefined && comp.crewOverride === trimmed) {
        await this.competitors.updateResult(comp.id, { crewOverride: undefined });
      }
    }
  }

  private async applyEntryChange(
    entry: SeriesEntry,
    op: Exclude<EditOperation, { type: 'setCrew' | 'deleteCompetitor' }>,
  ): Promise<void> {
    // setHelm / setBoatClass / setSailNumber rewrite the per-hull identity
    // tuple and could collide with another existing SeriesEntry. Guard against
    // that here so we never break the "one entry per (helm, class, sail)"
    // invariant via a rename - the user must resolve the duplicate first.
    if (op.type === 'setHelm' || op.type === 'setBoatClass' || op.type === 'setSailNumber') {
      this.assertRenameDoesNotCollide(entry, op);
    }

    const update: Partial<SeriesEntry> = {};
    switch (op.type) {
      case 'setHelm':
        if (entry.helm === op.value) return;
        update.helm = op.value;
        break;
      case 'setBoatClass':
        if (entry.boatClass === op.value) return;
        update.boatClass = op.value;
        break;
      case 'setSailNumber':
        if (entry.sailNumber === op.value) return;
        update.sailNumber = op.value;
        break;
      case 'setHandicap': {
        const current = getHandicapValue(entry.handicaps, op.scheme);
        if (current === op.value) return;
        const without = (entry.handicaps ?? []).filter(h => h.scheme !== op.scheme);
        update.handicaps = [...without, { scheme: op.scheme, value: op.value }];
        break;
      }
      case 'setPersonalHandicapBand':
        if ((entry.personalHandicapBand ?? null) === (op.band ?? null)) return;
        update.personalHandicapBand = op.band;
        break;
    }
    if (Object.keys(update).length > 0) {
      await this.seriesEntries.updateEntry(entry.id, update);
    }
  }

  /**
   * Throws if applying `op` to `entry` would produce a per-hull identity that
   * already exists on a different SeriesEntry in the same series. Excludes
   * the entry being edited itself so a no-op rename is allowed.
   */
  private assertRenameDoesNotCollide(
    entry: SeriesEntry,
    op: Extract<EditOperation, { type: 'setHelm' | 'setBoatClass' | 'setSailNumber' }>,
  ): void {
    const next: PerHullIdentity = {
      helm: op.type === 'setHelm' ? op.value : entry.helm,
      boatClass: op.type === 'setBoatClass' ? op.value : entry.boatClass,
      sailNumber: op.type === 'setSailNumber' ? op.value : entry.sailNumber,
    };
    const sameSeries = this.seriesEntries
      .selectedEntries()
      .filter(e => e.seriesId === entry.seriesId);
    const collision = findCollidingEntry(sameSeries, next, entry.id);
    if (collision) {
      throw new ScoreSmarterError(
        `Cannot rename: another series entry already exists for ` +
        `${describeIdentity(next)} (id ${collision.id}). ` +
        `Delete or merge that entry before renaming.`,
      );
    }
  }

  private async deleteCompetitor(target: RaceCompetitor): Promise<void> {
    await this.competitors.deleteResult(target.id);
    // If no other RaceCompetitor still references the SeriesEntry, drop the
    // entry too so it doesn't haunt the series with a phantom DNC row.
    const stillReferenced = this.competitors
      .selectedCompetitors()
      .some(c => c.id !== target.id && c.seriesEntryId === target.seriesEntryId);
    if (!stillReferenced) {
      await this.seriesEntries.deleteEntry(target.seriesEntryId);
    }
  }
}
