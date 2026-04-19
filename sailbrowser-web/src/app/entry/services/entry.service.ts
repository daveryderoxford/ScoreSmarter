import { Injectable, inject } from '@angular/core';
import { RaceCalendarStore } from 'app/race-calender';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { ClubStore } from '../../club-tenant';
import { Race } from '../../race-calender/model/race';
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { SeriesEntry } from '../../results-input/model/series-entry';
import { RaceCompetitorStore } from '../../results-input/services/race-competitor-store';
import { Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { resolveHandicapsForSeries } from './entry-helpers';
import {
  PerHullIdentity,
  describeIdentity,
  detectInRaceConflict,
  EntryConflictReason,
  findAllMatchingEntries,
} from 'app/results-input/services/series-entry-identity';

export interface EntryDetails {
  races: Race[];
  helm: string;
  crew?: string;
  boatClass: string;
  sailNumber: number;
  handicaps?: Handicap[];
  personalHandicapBand?: PersonalHandicapBand;
}

/**
 * A pre-existing race entry that prevents the proposed sign-on. Surfaced to
 * the UI so the user can choose to overwrite (boat-swap) or cancel; never
 * reported when the proposed entry can simply be added.
 */
export interface EntryConflict {
  race: Race;
  reason: EntryConflictReason;
  existingCompetitor: RaceCompetitor;
  existingEntry: SeriesEntry;
}

/**
 * Per-hull SeriesEntry creation.
 *
 * Each unique (boatClass, sailNumber, helm) tuple in a series corresponds to
 * exactly one SeriesEntry. The series-level `entryAlgorithm` only controls
 * how those entries are *merged at scoring time* into competitor groups (see
 * `mergeKeyFor`); it no longer affects how entries are created or how
 * duplicate sign-on is detected. This guarantees per-hull data (handicap,
 * boat class) is never overwritten when one helm sails multiple boats in
 * the same series.
 */
@Injectable({
  providedIn: 'root'
})
export class EntryService {
  private clubStore = inject(ClubStore);
  private raceResultsStore = inject(RaceCompetitorStore);
  private seriesEntryStore = inject(SeriesEntryStore);
  private raceCalanderStore = inject(RaceCalendarStore);

  /** Enter a race
   * throws a ScoreSmarterError exception if any conflict is detected.
   *
   * Callers that want to surface conflicts to the user (boat-swap UX) should
   * call `findEntryConflicts` first and, if appropriate, `swapAndEnter`. This
   * method is a strict guard for any caller that doesn't.
   */
  async enterRaces(details: EntryDetails): Promise<void> {

    const conflicts = this.findEntryConflicts(details);
    if (conflicts.length > 0) {
      throw new ScoreSmarterError(
        `Entry conflict for ${describeIdentity({
          boatClass: details.boatClass,
          sailNumber: details.sailNumber,
          helm: details.helm,
        })}`,
      );
    }

    for (const race of details.races) {
      const series = this.raceCalanderStore.allSeries().find(s => s.id === race.seriesId);
      if (!series) {
        const msg = 'EntryService: Series not found for race: ' + race.toString();
        console.error(msg);
        throw new ScoreSmarterError(msg);
      }

      const handicapsForEntry = resolveHandicapsForSeries(series, {
        boatClassName: details.boatClass,
        handicaps: details.handicaps,
        personalHandicapBand: details.personalHandicapBand,
        personalHandicapUnknown: !details.personalHandicapBand,
      }, this.clubStore.club().classes);

      const seriesEntryId =
        await this.findOrCreateSeriesEntry(race, details, handicapsForEntry);

      const competitor: Partial<RaceCompetitor> = {
        raceId: race.id,
        seriesId: race.seriesId,
        seriesEntryId,
        resultCode: 'NOT FINISHED',
      };

      await this.raceResultsStore.addResult(competitor);
    }
  }

  /**
   * Find every existing race entry that prevents the proposed sign-on across
   * the selected races. Each conflict is reported with its reason (exact-hull
   * duplicate, helm-already-in-race for merged-helm series, hull-already-in-
   * race for merged-hull series) so the caller can present a swap dialog.
   *
   * Joins each per-race competitor row to its SeriesEntry because identity
   * fields (helm/boatClass/sailNumber) live on the entry, not on the race
   * competitor.
   */
  findEntryConflicts(details: EntryDetails): EntryConflict[] {
    const incoming: PerHullIdentity = {
      boatClass: details.boatClass,
      sailNumber: details.sailNumber,
      helm: details.helm,
    };

    const entriesById = new Map(
      this.seriesEntryStore.selectedEntries().map(e => [e.id, e] as const),
    );
    const allComps = this.raceResultsStore.selectedCompetitors();
    const conflicts: EntryConflict[] = [];

    for (const race of details.races) {
      const series = this.raceCalanderStore.allSeries().find(s => s.id === race.seriesId);
      // Default to the strictest strategy if the series can't be located so
      // we never silently downgrade conflict detection.
      const strategy = series?.entryAlgorithm ?? 'classSailNumberHelm';

      for (const comp of allComps) {
        if (comp.raceId !== race.id) continue;
        const entry = entriesById.get(comp.seriesEntryId);
        if (!entry) continue;
        const reason = detectInRaceConflict(entry, incoming, strategy);
        if (reason) {
          conflicts.push({ race, reason, existingCompetitor: comp, existingEntry: entry });
        }
      }
    }

    return conflicts;
  }

  /**
   * Boat-swap path: delete every conflicting race competitor (and any
   * SeriesEntry that becomes orphaned in *this* series as a result), then
   * proceed with the requested entry. The caller is expected to have already
   * obtained the user's consent via the conflict dialog.
   *
   * The deletion is per-race: an existing entry that is also used in OTHER
   * races stays put and only loses its row in the conflicting race(s).
   */
  async swapAndEnter(details: EntryDetails, conflicts: EntryConflict[]): Promise<void> {
    for (const conflict of conflicts) {
      await this.raceResultsStore.deleteResult(conflict.existingCompetitor.id);
    }

    // Re-evaluate after the deletions so we don't sign in twice if the same
    // race appeared in `conflicts` AND another later code path tries to add
    // it again. After the swap there must be no remaining conflicts; if there
    // are, the caller's view of the world was stale and we abort loudly.
    const remaining = this.findEntryConflicts(details);
    if (remaining.length > 0) {
      throw new ScoreSmarterError(
        `Boat swap could not clear all conflicts (${remaining.length} remaining). ` +
        `Refresh and try again.`,
      );
    }

    await this.enterRaces(details);

    // Best-effort cleanup: if the swap left a SeriesEntry with no race
    // competitors anywhere, drop it so it doesn't haunt the entry list. We do
    // this after `enterRaces` so we never delete an entry the new sign-on is
    // about to reuse (findOrCreateSeriesEntry matches on identity, so the
    // entry id we deleted from would only be reused if identity matched the
    // incoming entry — which it can't, since that would have been a
    // `sameEntry` conflict and consumed by `enterRaces` above).
    await this.cleanupOrphanedEntries(conflicts);
  }

  private async cleanupOrphanedEntries(conflicts: EntryConflict[]): Promise<void> {
    const candidateIds = new Set(conflicts.map(c => c.existingEntry.id));
    const stillReferenced = new Set(
      this.raceResultsStore.selectedCompetitors().map(c => c.seriesEntryId),
    );
    for (const entryId of candidateIds) {
      if (!stillReferenced.has(entryId)) {
        try {
          await this.seriesEntryStore.deleteEntry(entryId);
        } catch (err) {
          // Don't fail the whole swap if cleanup fails — the new entry is
          // already in place. Just log so we can spot leaking entries later.
          console.warn(`EntryService: orphaned SeriesEntry cleanup failed for ${entryId}`, err);
        }
      }
    }
  }

  /**
   * Find an existing per-hull SeriesEntry (matched by boatClass + sailNumber +
   * helm) or create one. Updates the entry's handicaps/personalHandicapBand
   * to the latest input so they stay current; identity fields are preserved.
   */
  async findOrCreateSeriesEntry(race: Race, details: EntryDetails, handicaps: Handicap[]): Promise<string> {
    const seriesEntries = this.seriesEntryStore.selectedEntries()
      .filter(e => e.seriesId === race.seriesId);

    const identity: PerHullIdentity = {
      boatClass: details.boatClass,
      sailNumber: details.sailNumber,
      helm: details.helm,
    };
    const matches = findAllMatchingEntries(seriesEntries, identity);

    // Per-hull invariant: at most one SeriesEntry should ever match a given
    // (helm, boatClass, sailNumber). Detecting more than one means a previous
    // write (a rename, a manual Firestore edit, or a pre-refactor merge) has
    // corrupted the dataset. Refuse to write more results against either
    // entry until the duplicate is resolved.
    if (matches.length > 1) {
      throw new ScoreSmarterError(
        `Data integrity error: ${matches.length} SeriesEntries already match ` +
        `${describeIdentity(identity)} in series ${race.seriesId} ` +
        `(ids: ${matches.map(e => e.id).join(', ')}). ` +
        `Resolve the duplicate before continuing.`,
      );
    }

    const existing = matches[0];

    if (existing) {
      const entryUpdate: Partial<SeriesEntry> = {
        handicaps,
        personalHandicapBand: details.personalHandicapBand,
        tags: this.withPersonalBandTag(existing.tags, details.personalHandicapBand),
      };
      // Update crew if a value was provided (stays on the entry).
      if (details.crew !== undefined && details.crew !== existing.crew) {
        entryUpdate.crew = details.crew;
      }
      await this.seriesEntryStore.updateEntry(existing.id, entryUpdate);
      return existing.id;
    }

    console.log(`EntryService: Adding series entry ${race.seriesName} index: ${race.index}`);

    return this.seriesEntryStore.addEntry({
      seriesId: race.seriesId,
      helm: details.helm,
      crew: details.crew,
      boatClass: details.boatClass,
      sailNumber: details.sailNumber,
      handicaps,
      personalHandicapBand: details.personalHandicapBand,
      tags: this.withPersonalBandTag([], details.personalHandicapBand),
    });
  }

  private withPersonalBandTag(tags: string[] | undefined, band: PersonalHandicapBand | undefined): string[] {
    const next = new Set((tags ?? []).filter(t => !t.startsWith('personal-band:')));
    if (band) next.add(`personal-band:${band}`);
    return [...next];
  }
}
