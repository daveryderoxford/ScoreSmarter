import { Injectable, inject } from '@angular/core';
import { normalizeSailNumber } from 'app/boats/model/sail-number';
import { ClubStore } from 'app/club-tenant';
import { resolveHandicapsForSeries } from 'app/entry/services/entry-helpers';
import { RatingListStore } from 'app/club-tenant/services/rating-list-store';
import { divisionIdsEqual, entryDivisionIds } from 'app/race-calender/model/division';
import { Race, RaceCalendarStore, Series } from 'app/race-calender';
import { getHandicapValue, Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import type { ResultCode } from 'app/scoring/model/result-code';
import { formatRaceTitle } from 'app/shared/pipes/race-title-pipe';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { RaceCompetitor } from '../model/race-competitor';
import { SeriesEntry } from '../model/series-entry';
import {
  RaceCompetitorMutator,
  SeriesEntryIdentityConflictError,
} from './race-competitor-mutator';
import { RaceCompetitorStore } from './race-competitor-store';
import {
  PerHullIdentity,
  describeIdentity,
  detectInRaceConflict,
  findCollidingEntry,
  identityChange,
} from './series-entry-identity';
import { SeriesEntryStore } from './series-entry-store';

/**
 * Where an identity change (helm, class or sail number) applies:
 *  - `race`   — only the race being edited moves to the new identity; other races keep the entry.
 *  - `series` — every race on the entry moves to the new identity.
 */
export type EntryEditScope = 'race' | 'series';

/** Every editable series-entry field, as entered on the Edit entry form. */
export interface EntryEditCommand {
  competitorId: string;
  helm: string;
  boatClass: string;
  sailNumber: string;
  /** Empty string clears; omit to leave unchanged (singlehanders). */
  crew?: string;
  /** Empty string clears. */
  club: string;
  /** Empty string clears. */
  boatName: string;
  /** `null` is an unknown band; omit when the series has no personal handicaps. */
  personalHandicapBand?: PersonalHandicapBand | null;
  divisions: string[];
  /** Values for the schemes shown on the form. Unchanged values follow a class change. */
  handicaps: Handicap[];
  /** Required when the identity changes and other races share the entry. */
  scope?: EntryEditScope;
}

export interface RaceResultDataCommand {
  competitorId: string;
  startTime?: Date;
  manualFinishTime?: Date | null;
  manualLaps?: number;
  resultCode?: ResultCode;
  manualPosition?: number | null;
  crewOverride?: string;
}

interface EditContext {
  target: RaceCompetitor;
  entry: SeriesEntry;
  series: Series;
}

@Injectable({ providedIn: 'root' })
export class RaceCompetitorEditService {
  private readonly competitors = inject(RaceCompetitorStore);
  private readonly seriesEntries = inject(SeriesEntryStore);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly clubStore = inject(ClubStore);
  private readonly ratingLists = inject(RatingListStore);
  private readonly mutator = inject(RaceCompetitorMutator);

  /** Races other than this one sailed on the competitor's series entry, in calendar order. */
  async otherRacesOnEntry(competitorId: string): Promise<Race[]> {
    const { target, entry } = this.resolveEditContext(competitorId);
    const refs = await this.competitors.getCompetitorsForSeriesEntry(entry.id);
    const raceIds = new Set(refs.filter(c => c.id !== target.id).map(c => c.raceId));
    return this.raceCalendar.allRaces().filter(r => raceIds.has(r.id));
  }

  /** Handicaps the entry would have after `command`, for showing before a class change is saved. */
  async previewHandicaps(command: EntryEditCommand): Promise<Handicap[]> {
    const { entry, series } = this.resolveEditContext(command.competitorId);
    const next = await this.proposedEntry(entry, entry, command, identityOf(command), series);
    return next.handicaps;
  }

  /**
   * Saves the Edit entry form. Non-identity fields and capitalisation-only changes update
   * the entry in place. An identity change moves this race (`race` scope) or every race on
   * the entry (`series` scope) to the new identity, merging into an existing entry for that
   * identity unless it is already in one of those races.
   */
  async applyEntryEdit(command: EntryEditCommand): Promise<void> {
    const { target, entry, series } = this.resolveEditContext(command.competitorId);
    const identity = identityOf(command);

    if (identityChange(entry, identity) === 'none') {
      await this.saveEntry(entry, await this.proposedEntry(entry, entry, command, identity, series));
      return;
    }

    const [seriesComps, seriesEntries] = await Promise.all([
      this.competitors.getSeriesCompetitors(series.id),
      this.seriesEntries.getSeriesEntries(series.id),
    ]);
    const onEntry = seriesComps.filter(c => c.seriesEntryId === entry.id);
    const sharedWithOtherRaces = onEntry.some(c => c.id !== target.id);
    const scope: EntryEditScope | undefined = sharedWithOtherRaces ? command.scope : 'series';
    if (!scope) {
      throw new ScoreSmarterError(
        'Choose whether this change is for this race only or for every race on this entry.',
      );
    }

    const moving = scope === 'race' ? [target] : onEntry;
    this.assertNoInRaceConflicts(series, identity, moving, seriesComps, seriesEntries);

    const existing = findCollidingEntry(seriesEntries, identity, entry.id);
    if (scope === 'race') {
      if (existing) {
        await this.mutator.repointRaceCompetitorToEntry(target, existing.id, { cleanupOldEntry: 'ifOrphan' });
      } else {
        const created = await this.proposedEntry(entry, entry, command, identity, series);
        const newEntryId = await this.mutator.createSeriesEntry({
          seriesId: entry.seriesId,
          helm: created.helm,
          boatClass: created.boatClass,
          sailNumber: created.sailNumber,
          crew: created.crew ?? undefined,
          club: created.club ?? undefined,
          boatName: created.boatName ?? undefined,
          divisions: entryDivisionIds(created),
          personalHandicapBand: created.personalHandicapBand ?? undefined,
          handicaps: created.handicaps,
        });
        await this.mutator.repointRaceCompetitorToEntry(target, newEntryId, { cleanupOldEntry: 'ifOrphan' });
      }
      return;
    }

    if (existing) {
      await this.saveEntry(existing, await this.proposedEntry(existing, entry, command, identity, series));
      await this.mutator.mergeSeriesEntryInto(entry.id, existing.id);
    } else {
      await this.saveEntry(entry, await this.proposedEntry(entry, entry, command, identity, series));
    }
  }

  async applyRaceResultData(command: RaceResultDataCommand): Promise<void> {
    const { target } = this.resolveEditContext(command.competitorId);
    const raceUpdates: Partial<RaceCompetitor> = {};

    if (command.crewOverride !== undefined) {
      const next =
        command.crewOverride === '' ? undefined : command.crewOverride;
      if ((target.crewOverride ?? null) !== (next ?? null)) {
        raceUpdates.crewOverride = next;
      }
    }
    if (command.startTime !== undefined && target.startTime !== command.startTime) {
      raceUpdates.startTime = command.startTime;
    }
    if (
      command.manualFinishTime !== undefined &&
      target.manualFinishTime !== command.manualFinishTime
    ) {
      raceUpdates.manualFinishTime = command.manualFinishTime ?? undefined;
    }
    if (command.manualLaps !== undefined && target.manualLaps !== command.manualLaps) {
      raceUpdates.manualLaps = command.manualLaps;
    }
    if (command.resultCode !== undefined && target.resultCode !== command.resultCode) {
      raceUpdates.resultCode = command.resultCode;
    }
    if (command.manualPosition !== undefined) {
      const next =
        command.manualPosition === null ? undefined : command.manualPosition;
      if (target.manualPosition !== next) {
        raceUpdates.manualPosition = next;
      }
    }

    if (Object.keys(raceUpdates).length === 0) return;

    await this.competitors.updateResult(target.id, raceUpdates);
    await this.markRaceDirty(target.raceId);
  }

  async deleteRaceCompetitor(competitorId: string): Promise<void> {
    const { target } = this.resolveEditContext(competitorId);
    await this.mutator.deleteRaceCompetitor(target);
  }

  private resolveEditContext(competitorId: string): EditContext {
    const target = this.competitors.selectedCompetitors().find(c => c.id === competitorId);
    if (!target) {
      throw new Error(`Competitor not found: ${competitorId}`);
    }
    const entry = this.seriesEntries.selectedEntries().find(e => e.id === target.seriesEntryId);
    if (!entry) {
      throw new Error(
        `SeriesEntry ${target.seriesEntryId} not found for competitor ${target.id}`,
      );
    }
    const series = this.raceCalendar.allSeries().find(s => s.id === entry.seriesId);
    if (!series) {
      throw new Error(`Series ${entry.seriesId} not found for entry ${entry.id}`);
    }
    return { target, entry, series };
  }

  /**
   * `base` with `identity` and every form field the user changed from `original`.
   * Handicaps are recalculated when the class or band changes; handicap values the
   * user typed take precedence.
   */
  private async proposedEntry(
    base: SeriesEntry,
    original: SeriesEntry,
    command: EntryEditCommand,
    identity: PerHullIdentity,
    series: Series,
  ): Promise<SeriesEntry> {
    const next: SeriesEntry = { ...base, ...identity };

    if (command.crew !== undefined && command.crew !== (original.crew ?? '')) {
      next.crew = clearable(command.crew);
    }
    if (command.club !== (original.club ?? '')) next.club = clearable(command.club);
    if (command.boatName !== (original.boatName ?? '')) next.boatName = clearable(command.boatName);
    if (!divisionIdsEqual(entryDivisionIds(original), command.divisions)) {
      next.divisions = [...command.divisions];
    }

    const bandEdited =
      command.personalHandicapBand !== undefined &&
      (command.personalHandicapBand ?? null) !== (original.personalHandicapBand ?? null);
    if (bandEdited) {
      next.personalHandicapBand = (command.personalHandicapBand ?? null) as PersonalHandicapBand | undefined;
    }

    const typed = command.handicaps.filter(
      h => getHandicapValue(original.handicaps, h.scheme) !== h.value,
    );
    const classChanged = !sameText(base.boatClass, identity.boatClass);
    if (classChanged || bandEdited || typed.length > 0) {
      const band = next.personalHandicapBand ?? undefined;
      const ratingLists = await this.ratingLists.load();
      next.handicaps = resolveHandicapsForSeries(
        series,
        {
          boatClassName: identity.boatClass,
          handicaps: classChanged ? typed : overlayHandicaps(base.handicaps, typed),
          personalHandicapBand: band,
          personalHandicapUnknown: !band,
        },
        this.clubStore.club().classes,
        ratingLists,
      );
    }
    return next;
  }

  private async saveEntry(previous: SeriesEntry, next: SeriesEntry): Promise<void> {
    try {
      await this.mutator.updateSeriesEntryFromEdit(previous, next);
    } catch (err) {
      if (err instanceof SeriesEntryIdentityConflictError) {
        throw new ScoreSmarterError(
          `Cannot update: another series entry already exists for ` +
            `${describeIdentity(err.identity)}.`,
        );
      }
      throw err;
    }
  }

  /** Rejects the edit if `identity` would clash with another boat in any race `moving` rows are in. */
  private assertNoInRaceConflicts(
    series: Series,
    identity: PerHullIdentity,
    moving: RaceCompetitor[],
    seriesComps: RaceCompetitor[],
    seriesEntries: SeriesEntry[],
  ): void {
    const movingIds = new Set(moving.map(c => c.id));
    const raceIds = new Set(moving.map(c => c.raceId));
    const entriesById = new Map(seriesEntries.map(e => [e.id, e]));
    const strategy = series.entryAlgorithm ?? 'classSailNumberHelm';

    for (const comp of seriesComps) {
      if (movingIds.has(comp.id) || !raceIds.has(comp.raceId)) continue;
      const other = entriesById.get(comp.seriesEntryId);
      if (!other) continue;
      const reason = detectInRaceConflict(other, identity, strategy);
      if (!reason) continue;

      const race = this.raceCalendar.allRaces().find(r => r.id === comp.raceId);
      const where = race ? formatRaceTitle(race) : 'this race';
      switch (reason) {
        case 'sameEntry':
          throw new ScoreSmarterError(`${describeIdentity(identity)} is already entered in ${where}.`);
        case 'sameHullDifferentHelm':
          throw new ScoreSmarterError(
            `${other.helm} is already sailing ${other.boatClass} ${other.sailNumber} in ${where}.`,
          );
        case 'sameHelmDifferentHull':
          throw new ScoreSmarterError(
            `${other.helm} is already entered in ${where} on ${other.boatClass} ${other.sailNumber}.`,
          );
      }
    }
  }

  private async markRaceDirty(raceId: string): Promise<void> {
    await this.raceCalendar.updateRace(raceId, { dirty: true });
  }
}

function identityOf(command: EntryEditCommand): PerHullIdentity {
  return {
    helm: command.helm.trim(),
    boatClass: command.boatClass.trim(),
    sailNumber: normalizeSailNumber(command.sailNumber),
  };
}

/** A merge write only clears a field given `null`. */
function clearable(text: string): string | undefined {
  const trimmed = text.trim();
  return (trimmed || null) as string | undefined;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function overlayHandicaps(base: Handicap[], typed: Handicap[]): Handicap[] {
  const typedSchemes = new Set(typed.map(h => h.scheme));
  return [...base.filter(h => !typedSchemes.has(h.scheme)), ...typed];
}
