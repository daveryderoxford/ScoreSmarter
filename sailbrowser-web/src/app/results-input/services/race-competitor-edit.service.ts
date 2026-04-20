import { inject, Injectable } from '@angular/core';
import { SeriesEntryStore } from './series-entry-store';
import { RaceCompetitorStore } from './race-competitor-store';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import { applyPersonalBandTag, resolveHandicapsForSeries } from 'app/entry/services/entry-helpers';
import { Handicap, getHandicapValue } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { RaceCompetitor } from '../model/race-competitor';
import { SeriesEntry } from '../model/series-entry';
import {
  PerHullIdentity,
  describeIdentity,
  detectInRaceConflict,
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
 * Single-shot edit of every correctable `SeriesEntry` field plus crew.
 * Handicaps are not part of this payload: they are re-resolved from the new
 * class / personal band via `resolveHandicapsForSeries` when those change.
 *
 * `crewScope`: `raceOnly` updates `RaceCompetitor.crewOverride` for this
 * race; `wholeSeries` updates `SeriesEntry.crew` (the post-entry correction
 * form always sends `raceOnly`).
 *
 * Intended for the post-entry correction dialog; the per-operation
 * `EditRaceCompetitorCommand` + `apply()` path remains for other callers.
 */
export interface SeriesEntryEditCommand {
  competitorId: string;
  helm: string;
  crew: string;
  crewScope: CrewEditScope;
  boatClass: string;
  sailNumber: number;
  personalHandicapBand?: PersonalHandicapBand;
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
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly clubStore = inject(ClubStore);

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

  /**
   * Single-shot multi-field edit from the post-entry correction dialog.
   *
   * Steps, in order, so that we never half-apply a change:
   * 1. Resolve competitor + entry + series.
   * 2. Build the proposed identity tuple and run duplicate + in-race
   *    conflict checks against the *final* (helm, class, sail).
   * 3. Persist crew using its scope rule (race override vs entry).
   * 4. Recompute handicaps/tags for the new class / band, then write every
   *    changed entry field in one `updateEntry` call.
   * 5. Mark affected races dirty so the existing guards republish on leave.
   */
  async applyEdit(command: SeriesEntryEditCommand): Promise<void> {
    const target = this.competitors.selectedCompetitors().find(c => c.id === command.competitorId);
    if (!target) {
      throw new Error(`Competitor not found: ${command.competitorId}`);
    }
    const entry = this.seriesEntries.selectedEntries().find(e => e.id === target.seriesEntryId);
    if (!entry) {
      throw new Error(`SeriesEntry ${target.seriesEntryId} not found for competitor ${target.id}`);
    }
    const series = this.raceCalendar.allSeries().find(s => s.id === entry.seriesId);
    if (!series) {
      throw new Error(`Series ${entry.seriesId} not found for entry ${entry.id}`);
    }

    const helm = command.helm.trim();
    const crew = command.crew.trim();
    const boatClass = command.boatClass.trim();
    const sailNumber = command.sailNumber;

    const proposed: PerHullIdentity = { helm, boatClass, sailNumber };

    // Duplicate across the same series (rename collision). This catches any
    // combination of helm / class / sail changes in one go so editing two
    // fields together can't smuggle the entry into a sibling's slot.
    const sameSeriesEntries = this.seriesEntries
      .selectedEntries()
      .filter(e => e.seriesId === entry.seriesId);
    const collision = findCollidingEntry(sameSeriesEntries, proposed, entry.id);
    if (collision) {
      throw new ScoreSmarterError(
        `Cannot rename: another series entry already exists for ` +
        `${describeIdentity(proposed)} (id ${collision.id}). ` +
        `Delete or merge that entry before renaming.`,
      );
    }

    // In-race conflict against other competitors in the same race under the
    // series' entry strategy (helm-in-race / hull-in-race). A no-op identity
    // would match the target itself, so we exclude its own competitor row.
    const currentRaceComps = this.competitors
      .selectedCompetitors()
      .filter(c => c.raceId === target.raceId && c.id !== target.id);
    const strategy = series.entryAlgorithm ?? 'classSailNumberHelm';
    for (const comp of currentRaceComps) {
      const otherEntry = this.seriesEntries.selectedEntries().find(e => e.id === comp.seriesEntryId);
      if (!otherEntry) continue;
      const reason = detectInRaceConflict(otherEntry, proposed, strategy);
      if (reason) {
        throw new ScoreSmarterError(
          `Cannot update: ${describeIdentity(proposed)} would conflict with ` +
          `${describeIdentity(otherEntry)} in this race (${reason}).`,
        );
      }
    }

    // Crew: the only field with per-race scope. We apply it first so a
    // downstream entry-write failure can't leave the race row mutated in a
    // way that contradicts the entry's crew.
    const crewScopeChanged = await this.applyCrewEdit(target, entry, crew, command.crewScope);

    // Entry field changes. Handicaps are re-resolved *only* when the boat
    // class or personal band actually changed; a bare helm/crew correction
    // must not silently rewrite handicaps and republish every race in the
    // series.
    const personalHandicapBand = command.personalHandicapBand;
    const classChanged = entry.boatClass !== boatClass;
    const bandChanged =
      (entry.personalHandicapBand ?? undefined) !== (personalHandicapBand ?? undefined);

    const entryUpdate: Partial<SeriesEntry> = {};
    if (entry.helm !== helm) entryUpdate.helm = helm;
    if (classChanged) entryUpdate.boatClass = boatClass;
    if (entry.sailNumber !== sailNumber) entryUpdate.sailNumber = sailNumber;
    if (bandChanged) entryUpdate.personalHandicapBand = personalHandicapBand;

    if (classChanged || bandChanged) {
      // When the hull's class changes, do not pass the old `entry.handicaps`
      // into the resolver: valid PY (etc.) on the entry are treated as user
      // overrides and would otherwise stick to the previous class's numbers.
      // A class change means "take handicaps from the new club class (+ band
      // rules)" — same as the entry form preview. Band-only edits keep the
      // existing handicap array so PY-based Personal math stays stable.
      const recomputed = resolveHandicapsForSeries(
        series,
        {
          boatClassName: boatClass,
          handicaps: classChanged ? undefined : entry.handicaps,
          personalHandicapBand,
          personalHandicapUnknown: !personalHandicapBand,
        },
        this.clubStore.club().classes,
      );
      if (!handicapsEqual(entry.handicaps, recomputed)) {
        entryUpdate.handicaps = recomputed;
      }
      const nextTags = applyPersonalBandTag(entry.tags, personalHandicapBand);
      if (!tagsEqual(entry.tags, nextTags)) {
        entryUpdate.tags = nextTags;
      }
    }

    const entryChanged = Object.keys(entryUpdate).length > 0;
    if (entryChanged) {
      await this.seriesEntries.updateEntry(entry.id, entryUpdate);
    }

    // Dirty marking: every race that references this entry is now stale for
    // series-scope changes. For a pure race-only crew edit we only touch the
    // current race. The set is always a superset of the current race when
    // any entry field changed.
    const raceIdsToMark = new Set<string>();
    if (crewScopeChanged === 'race') {
      raceIdsToMark.add(target.raceId);
    }
    if (entryChanged || crewScopeChanged === 'series') {
      for (const comp of this.competitors.selectedCompetitors()) {
        if (comp.seriesEntryId === entry.id) raceIdsToMark.add(comp.raceId);
      }
    }
    for (const raceId of raceIdsToMark) {
      await this.raceCalendar.updateRace(raceId, { dirty: true });
    }
  }

  /**
   * Returns `'race'` when only the current `RaceCompetitor.crewOverride` was
   * touched, `'series'` when the entry crew was written, or `null` when the
   * value was already in sync with the selected scope.
   */
  private async applyCrewEdit(
    target: RaceCompetitor,
    entry: SeriesEntry,
    crew: string,
    scope: CrewEditScope,
  ): Promise<'race' | 'series' | null> {
    if (scope === 'raceOnly') {
      // `undefined` means "use the entry crew"; a deliberate empty string
      // override clears the entry crew for this race only.
      const next = crew === (entry.crew ?? '') ? undefined : crew;
      if ((target.crewOverride ?? null) === (next ?? null)) return null;
      await this.competitors.updateResult(target.id, { crewOverride: next });
      return 'race';
    }

    let changed = false;
    if ((entry.crew ?? '') !== crew) {
      await this.seriesEntries.updateEntry(entry.id, { crew });
      changed = true;
    }
    // Drop per-race overrides that now equal the new entry crew; we keep
    // overrides that still intentionally diverge.
    const allForEntry = this.competitors.selectedCompetitors().filter(c => c.seriesEntryId === entry.id);
    for (const comp of allForEntry) {
      if (comp.crewOverride !== undefined && comp.crewOverride === crew) {
        await this.competitors.updateResult(comp.id, { crewOverride: undefined });
        changed = true;
      }
    }
    return changed ? 'series' : null;
  }
}

function handicapsEqual(a: Handicap[] | undefined, b: Handicap[] | undefined): boolean {
  const ax = [...(a ?? [])].sort((x, y) => x.scheme.localeCompare(y.scheme));
  const bx = [...(b ?? [])].sort((x, y) => x.scheme.localeCompare(y.scheme));
  if (ax.length !== bx.length) return false;
  for (let i = 0; i < ax.length; i++) {
    if (ax[i].scheme !== bx[i].scheme || ax[i].value !== bx[i].value) return false;
  }
  return true;
}

function tagsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const ax = [...(a ?? [])].sort();
  const bx = [...(b ?? [])].sort();
  if (ax.length !== bx.length) return false;
  return ax.every((t, i) => t === bx[i]);
}
