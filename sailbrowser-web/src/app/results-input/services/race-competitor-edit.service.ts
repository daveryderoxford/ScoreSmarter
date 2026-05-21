import { Injectable, inject } from '@angular/core';
import { ClubStore } from 'app/club-tenant';
import { resolveHandicapsForSeries } from 'app/entry/services/entry-helpers';
import { RaceCalendarStore, Series } from 'app/race-calender';
import { Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import type { ResultCode } from 'app/scoring/model/result-code';
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
  entriesMatchIdentity,
  findCollidingEntry,
} from './series-entry-identity';
import { SeriesEntryStore } from './series-entry-store';

export interface ChangeEnteredCompetitorCommand {
  competitorId: string;
  helm: string;
  boatClass: string;
  sailNumber: number;
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

export interface SeriesTypoEditCommand {
  competitorId: string;
  helm: string;
  crew?: string;
  club?: string;
  personalHandicapBand?: PersonalHandicapBand | null;
  tags?: string[];
  handicaps?: Handicap[];
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
  private readonly mutator = inject(RaceCompetitorMutator);

  async applyChangeEnteredCompetitor(command: ChangeEnteredCompetitorCommand): Promise<void> {
    const { target, entry, series } = this.resolveEditContext(command.competitorId);
    const helm = command.helm.trim();
    const boatClass = command.boatClass.trim();
    const sailNumber = command.sailNumber;
    const proposed: PerHullIdentity = { helm, boatClass, sailNumber };

    if (
      entry.helm === helm &&
      entry.boatClass === boatClass &&
      entry.sailNumber === sailNumber
    ) {
      return;
    }

    this.assertIdentityAllowedInRace(target, entry, series, proposed);

    const boatClassChanged = !boatClassEqual(entry.boatClass, boatClass);
    const handicapsForCreate = boatClassChanged
      ? this.recomputeHandicapsForClass(series, boatClass, entry)
      : entry.handicaps;

    let workingEntry = entry;
    const collision = this.findSeriesCollision(entry, proposed);
    if (collision) {
      await this.mutator.repointRaceCompetitorToEntry(target, collision.id, {
        cleanupOldEntry: 'ifOrphan',
      });
      workingEntry = collision;
    } else {
      const newEntryId = await this.mutator.createSeriesEntry({
        seriesId: entry.seriesId,
        helm,
        boatClass,
        sailNumber,
        club: entry.club,
        crew: entry.crew,
        tags: entry.tags,
        personalHandicapBand: entry.personalHandicapBand,
        handicaps: handicapsForCreate,
      });
      await this.mutator.repointRaceCompetitorToEntry(target, newEntryId, {
        cleanupOldEntry: 'ifOrphan',
      });
      workingEntry = (await this.seriesEntries.getSeriesEntry(newEntryId))!;
    }

    if (boatClassChanged) {
      const recomputed = this.recomputeHandicapsForClass(series, boatClass, workingEntry);
      const entryUpdate: Partial<SeriesEntry> = { boatClass, handicaps: recomputed };
      if (
        !boatClassEqual(workingEntry.boatClass, boatClass) ||
        !handicapsEqual(workingEntry.handicaps, recomputed)
      ) {
        const next: SeriesEntry = { ...workingEntry, ...entryUpdate } as SeriesEntry;
        await this.mutator.updateSeriesEntryFromEdit(workingEntry, next);
      }
    }

    await this.markRaceDirty(target.raceId);
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

  async applySeriesTypo(command: SeriesTypoEditCommand): Promise<void> {
    const { target, entry, series } = this.resolveEditContext(command.competitorId);
    const helm = command.helm.trim();
    const proposed: PerHullIdentity = {
      helm,
      boatClass: entry.boatClass,
      sailNumber: entry.sailNumber,
    };

    // Typo correction always updates this series entry in place — never repoint/merge.
    if (!entriesMatchIdentity(entry, proposed)) {
      this.assertIdentityAllowedInRace(target, entry, series, proposed);
    }

    const workingEntry = entry;

    const commandSpecifiesBand = Object.prototype.hasOwnProperty.call(
      command,
      'personalHandicapBand',
    );
    const personalHandicapBand = command.personalHandicapBand;
    const bandChanged =
      commandSpecifiesBand &&
      (workingEntry.personalHandicapBand ?? undefined) !==
        (personalHandicapBand ?? undefined);

    const entryUpdate: Partial<SeriesEntry> = {};
    if (workingEntry.helm !== helm) entryUpdate.helm = helm;
    if (command.crew !== undefined && workingEntry.crew !== command.crew) {
      entryUpdate.crew = command.crew;
    }
    if (command.club !== undefined && workingEntry.club !== command.club) {
      entryUpdate.club = command.club;
    }
    if (commandSpecifiesBand && bandChanged) {
      entryUpdate.personalHandicapBand =
        personalHandicapBand === null ? undefined : personalHandicapBand;
    }
    if (bandChanged) {
      const recomputed = resolveHandicapsForSeries(
        series,
        {
          boatClassName: workingEntry.boatClass,
          handicaps: workingEntry.handicaps,
          personalHandicapBand: personalHandicapBand === null ? undefined : personalHandicapBand,
          personalHandicapUnknown: !personalHandicapBand,
        },
        this.clubStore.club().classes,
      );
      if (!handicapsEqual(workingEntry.handicaps, recomputed)) {
        entryUpdate.handicaps = recomputed;
      }
    } else if (
      command.handicaps &&
      !handicapsEqual(workingEntry.handicaps, command.handicaps)
    ) {
      entryUpdate.handicaps = command.handicaps;
    }
    if (command.tags !== undefined) {
      const nextTags = [...command.tags];
      if (!tagsEqual(workingEntry.tags, nextTags)) {
        entryUpdate.tags = nextTags;
      }
    }

    if (Object.keys(entryUpdate).length === 0) return;

    const next: SeriesEntry = { ...workingEntry, ...entryUpdate } as SeriesEntry;
    try {
      await this.mutator.updateSeriesEntryFromEdit(workingEntry, next);
    } catch (err) {
      if (err instanceof SeriesEntryIdentityConflictError) {
        throw new ScoreSmarterError(
          `Cannot update: another series entry already exists for ` +
            `${describeIdentity(err.identity)} (id ${err.collidingEntryId}).`,
        );
      }
      throw err;
    }

    await this.markRacesDirtyForEntry(workingEntry.id);
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

  private findSeriesCollision(
    entry: SeriesEntry,
    proposed: PerHullIdentity,
  ): SeriesEntry | undefined {
    const sameSeriesEntries = this.seriesEntries
      .selectedEntries()
      .filter(e => e.seriesId === entry.seriesId);
    return findCollidingEntry(sameSeriesEntries, proposed, entry.id);
  }

  private assertIdentityAllowedInRace(
    target: RaceCompetitor,
    entry: SeriesEntry,
    series: Series,
    proposed: PerHullIdentity,
  ): void {
    const collision = this.findSeriesCollision(entry, proposed);
    if (collision) {
      const alreadyInThisRace = this.competitors
        .selectedCompetitors()
        .some(
          c =>
            c.raceId === target.raceId &&
            c.id !== target.id &&
            c.seriesEntryId === collision.id,
        );
      if (alreadyInThisRace) {
        throw new ScoreSmarterError(
          `${describeIdentity(proposed)} is already entered in this race.`,
        );
      }
    }

    const currentRaceComps = this.competitors
      .selectedCompetitors()
      .filter(c => c.raceId === target.raceId && c.id !== target.id);
    const strategy = series.entryAlgorithm ?? 'classSailNumberHelm';
    for (const comp of currentRaceComps) {
      const otherEntry = this.seriesEntries.selectedEntries().find(
        e => e.id === comp.seriesEntryId,
      );
      if (!otherEntry) continue;
      const reason = detectInRaceConflict(otherEntry, proposed, strategy);
      if (reason) {
        throw new ScoreSmarterError(
          `Cannot update: ${describeIdentity(proposed)} would conflict with ` +
            `${describeIdentity(otherEntry)} in this race (${reason}).`,
        );
      }
    }
  }

  private async markRaceDirty(raceId: string): Promise<void> {
    await this.raceCalendar.updateRace(raceId, { dirty: true });
  }

  private async markRacesDirtyForEntry(seriesEntryId: string): Promise<void> {
    const raceIds = new Set<string>();
    for (const comp of this.competitors.selectedCompetitors()) {
      if (comp.seriesEntryId === seriesEntryId) raceIds.add(comp.raceId);
    }
    for (const raceId of raceIds) {
      await this.markRaceDirty(raceId);
    }
  }

  private recomputeHandicapsForClass(
    series: Series,
    boatClass: string,
    template: SeriesEntry,
  ): Handicap[] {
    return resolveHandicapsForSeries(
      series,
      {
        boatClassName: boatClass,
        handicaps: undefined,
        personalHandicapBand: template.personalHandicapBand,
        personalHandicapUnknown: !template.personalHandicapBand,
      },
      this.clubStore.club().classes,
    );
  }
}

function boatClassEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
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
