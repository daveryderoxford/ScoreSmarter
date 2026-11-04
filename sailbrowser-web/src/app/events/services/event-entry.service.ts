import { inject, Injectable } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { normalizeSailNumber } from 'app/boats/model/sail-number';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { ClubStore } from 'app/club-tenant/services/club-store';
import { meetsPrimaryFleetEligibility, resolveHandicapsForSeries } from 'app/entry/services/entry-helpers';
import type { Race } from 'app/race-calendar/model/race';
import { hasResults } from 'app/race-calendar/model/race-status';
import type { Series } from 'app/race-calendar/model/series';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import type { RaceCompetitor } from 'app/results-input/model/race-competitor';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { RaceCompetitorMutator, SeriesEntryIdentityConflictError } from 'app/results-input/services/race-competitor-mutator';
import { RaceCompetitorStore } from 'app/results-input/services/race-competitor-store';
import { describeIdentity } from 'app/results-input/services/series-entry-identity';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import type { Handicap } from 'app/scoring/model/handicap';
import { RatingListStore } from 'app/system-data/services/rating-list-store';
import { FIRESTORE_WRITES } from 'app/shared/firebase/firestore-writes';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { FIRESTORE_BULK_WRITE_TIMEOUT_MS, withTimeout } from 'app/shared/utils/with-timeout';

/** Entry fields a race officer sets on the event entry form. */
export interface EventEntryDetails {
  seriesId: string;
  helm: string;
  crew?: string;
  club?: string;
  boatName?: string;
  boatClass: string;
  sailNumber: string;
  divisions: string[];
}

/** Rows that still have no result; entries are only changed through rows like these. */
function unsailed(rows: readonly RaceCompetitor[]): boolean {
  return rows.every(r => r.resultCode === 'NOT FINISHED');
}

/** A merge write only clears a field given `null`. */
function clearable(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return (trimmed || null) as string | undefined;
}

function friendlyConflict(err: unknown, series: Series): unknown {
  if (err instanceof SeriesEntryIdentityConflictError) {
    return new ScoreSmarterError(`${describeIdentity(err.identity)} is already entered in ${series.name}.`);
  }
  return err;
}

/** Division ids on `to` with the same names as `ids` on `from`. */
export function mapDivisionsByName(ids: readonly string[], from: Series, to: Series): string[] {
  const names = new Set(
    ids.map(id => from.divisions?.find(d => d.id === id)?.name.trim().toLowerCase()).filter(Boolean),
  );
  return (to.divisions ?? []).filter(d => names.has(d.name.trim().toLowerCase())).map(d => d.id);
}

/**
 * Open-meeting entry management. Every entry has a `NOT FINISHED` row on each race that had not
 * started when it was entered; races already sailed have no row and score as DNC.
 */
@Injectable({ providedIn: 'root' })
export class EventEntryService {
  private readonly firestore = inject(Firestore);
  private readonly writes = inject(FIRESTORE_WRITES);
  private readonly calendar = inject(RaceCalendarStore);
  private readonly clubStore = inject(ClubStore);
  private readonly ratingLists = inject(RatingListStore);
  private readonly mutator = inject(RaceCompetitorMutator);
  private readonly competitors = inject(RaceCompetitorStore);
  private readonly seriesEntries = inject(SeriesEntryStore);

  async addEntry(details: EventEntryDetails): Promise<string> {
    const series = this.series(details.seriesId);
    const handicaps = await this.eligibleHandicaps(series, details.boatClass);
    const entryId = await this.createEntry(details, handicaps);
    const races = await this.calendar.getSeriesRacesById(series.id);
    await this.addRows(entryId, series.id, races.filter(r => r.status === 'Future'));
    await this.markScoredRacesDirty(races);
    return entryId;
  }

  /** Edits an entry within its series. A class change must stay in the series fleet. */
  async updateEntry(entry: SeriesEntry, details: EventEntryDetails): Promise<void> {
    if (details.seriesId !== entry.seriesId) {
      throw new ScoreSmarterError('Use Move to change the series of an entry.');
    }
    const series = this.series(entry.seriesId);
    const handicaps = details.boatClass === entry.boatClass
      ? entry.handicaps
      : await this.eligibleHandicaps(series, details.boatClass);
    try {
      await this.mutator.updateSeriesEntryFromEdit(entry, {
        ...entry,
        helm: details.helm,
        crew: clearable(details.crew),
        club: clearable(details.club),
        boatName: clearable(details.boatName),
        boatClass: details.boatClass,
        sailNumber: normalizeSailNumber(details.sailNumber),
        divisions: details.divisions,
        handicaps,
      });
    } catch (err) {
      throw friendlyConflict(err, series);
    }
  }

  /**
   * Moves an entry to another series (for example Aero 9 to Aero 7). Only allowed before any race
   * in either series has a result; after that, add a new entry instead.
   */
  async moveEntry(entry: SeriesEntry, details: EventEntryDetails): Promise<string> {
    const from = this.series(entry.seriesId);
    const to = this.series(details.seriesId);
    const [fromRaces, toRaces, rows] = await Promise.all([
      this.calendar.getSeriesRacesById(from.id),
      this.calendar.getSeriesRacesById(to.id),
      this.competitors.getCompetitorsForSeriesEntry(entry.id),
    ]);
    if ([...fromRaces, ...toRaces].some(hasResults) || !unsailed(rows)) {
      throw new ScoreSmarterError('Racing has started, so this entry cannot be moved. Add a new entry instead.');
    }

    const handicaps = await this.eligibleHandicaps(to, details.boatClass);
    const newId = await this.createEntry(details, handicaps);
    await this.addRows(newId, to.id, toRaces.filter(r => r.status === 'Future'));
    await this.deleteWithRows(entry.id, rows);
    return newId;
  }

  /** Deletes an entry that has no results yet. */
  async deleteEntry(entry: SeriesEntry): Promise<void> {
    const rows = await this.competitors.getCompetitorsForSeriesEntry(entry.id);
    if (!unsailed(rows)) {
      throw new ScoreSmarterError('This entry has results. Remove them in Results Input first.');
    }
    await this.deleteWithRows(entry.id, rows);
    await this.markScoredRacesDirty(await this.calendar.getSeriesRacesById(entry.seriesId));
  }

  /** Gives every entry a row on each race of the series that has not started. Safe to repeat. */
  async backfillRows(seriesId: string): Promise<void> {
    const [races, entries, rows] = await Promise.all([
      this.calendar.getSeriesRacesById(seriesId),
      this.seriesEntries.getSeriesEntries(seriesId),
      this.competitors.getSeriesCompetitors(seriesId),
    ]);
    const have = new Set(rows.map(r => `${r.seriesEntryId}\0${r.raceId}`));
    for (const entry of entries) {
      const missing = races.filter(r => r.status === 'Future' && !have.has(`${entry.id}\0${r.id}`));
      await this.addRows(entry.id, seriesId, missing);
    }
  }

  /** Sets every row still `NOT FINISHED` in the race to DNC. Returns how many were changed. */
  async markRemainingDnc(race: Race): Promise<number> {
    const rows = (await this.competitors.getSeriesCompetitors(race.seriesId))
      .filter(r => r.raceId === race.id && r.resultCode === 'NOT FINISHED');
    if (rows.length === 0) return 0;
    const batch = this.writes.writeBatch(this.firestore);
    for (const row of rows) {
      batch.set(this.competitors.raceResultDocRef(row.id), { resultCode: 'DNC' } as RaceCompetitor, { merge: true });
    }
    await withTimeout(batch.commit(), FIRESTORE_BULK_WRITE_TIMEOUT_MS, 'Marking DNC');
    await this.calendar.ensureRaceDirty(race.id);
    return rows.length;
  }

  private async createEntry(details: EventEntryDetails, handicaps: Handicap[]): Promise<string> {
    try {
      return await this.mutator.createSeriesEntry({
        ...details,
        sailNumber: normalizeSailNumber(details.sailNumber),
        handicaps,
      });
    } catch (err) {
      throw friendlyConflict(err, this.series(details.seriesId));
    }
  }

  private series(id: string): Series {
    const series = this.calendar.allSeries().find(s => s.id === id);
    if (!series) throw new ScoreSmarterError(`Series ${id} not found.`);
    return series;
  }

  private async eligibleHandicaps(series: Series, boatClass: string): Promise<Handicap[]> {
    const ratingLists = await this.ratingLists.load();
    const handicaps = resolveHandicapsForSeries(series, { boatClassName: boatClass }, this.clubStore.club().classes, ratingLists);
    if (!meetsPrimaryFleetEligibility(series, { boatClass, handicaps })) {
      throw new ScoreSmarterError(
        `${boatClass} is not in the ${getFleetName(series.primaryScoringConfiguration.fleet)} fleet for ${series.name}.`,
      );
    }
    return handicaps;
  }

  private async addRows(seriesEntryId: string, seriesId: string, races: readonly Race[]): Promise<void> {
    for (const race of races) {
      await this.competitors.addResult({ raceId: race.id, seriesId, seriesEntryId, resultCode: 'NOT FINISHED' });
    }
  }

  private async deleteWithRows(entryId: string, rows: readonly RaceCompetitor[]): Promise<void> {
    const batch = this.writes.writeBatch(this.firestore);
    for (const row of rows) batch.delete(this.competitors.raceResultDocRef(row.id));
    batch.delete(this.seriesEntries.seriesEntryDocRef(entryId));
    await withTimeout(batch.commit(), FIRESTORE_BULK_WRITE_TIMEOUT_MS, 'Deleting entry');
  }

  /** Entry counts change DNC points, so races already scored need rescoring. */
  private async markScoredRacesDirty(races: readonly Race[]): Promise<void> {
    for (const race of races.filter(hasResults)) {
      await this.calendar.ensureRaceDirty(race.id);
    }
  }
}
