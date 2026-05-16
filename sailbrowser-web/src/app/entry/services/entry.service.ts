import { Injectable, inject } from '@angular/core';
import { RaceCalendarStore } from 'app/race-calender';
import {
  RaceCompetitorMutator,
  SeriesEntryIdentityConflictError,
} from 'app/results-input/services/race-competitor-mutator';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { ClubStore } from '../../club-tenant';
import { Race } from '../../race-calender/model/race';
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { SeriesEntry } from '../../results-input/model/series-entry';
import { RaceCompetitorStore } from '../../results-input/services/race-competitor-store';
import { Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { SeriesEntryPartialUpdate } from 'app/results-input/services/series-entry-store';
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
  /**
   * Tag ids to seed on a newly-created SeriesEntry. Typically `Boat.tags`
   * forwarded by the entry UI. Existing entries keep their tags - the RO
   * may have overridden them; this field is ignored on the reuse path.
   * Optional: omitted/undefined is treated as no boat tags (`[]`).
   */
  tags?: string[];
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
  private mutator = inject(RaceCompetitorMutator);

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
   * Boat-swap path: delete every conflicting race competitor, then proceed
   * with the requested entry. The caller is expected to have already
   * obtained the user's consent via the conflict dialog.
   *
   * The deletion is per-race: an existing entry that is also used in OTHER
   * races stays put and only loses its row in the conflicting race(s).
   * Orphaned `SeriesEntry` documents are removed atomically by the mutator's
   * batched `deleteRaceCompetitor` (per-conflict authoritative orphan check).
   */
  async swapAndEnter(details: EntryDetails, conflicts: EntryConflict[]): Promise<void> {
    for (const conflict of conflicts) {
      await this.mutator.deleteRaceCompetitor(conflict.existingCompetitor);
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
      // Reuse path: refresh derived fields only. Tags are user-authored and
      // may have been overridden by an RO on the existing entry; do not
      // overwrite them with the incoming boat tags.
      //
      // `personalHandicapBand` is passed as `null` when the caller has no
      // band so the typed converter clears the field via `deleteField()`
      // on the partial write. Passing raw `undefined` would be *omitted*
      // by the converter (leave any stale band intact). The `null`
      // sentinel is part of the converter contract documented in
      // `firestore-helper.ts`.
      const entryUpdate: SeriesEntryPartialUpdate = {
        handicaps,
        personalHandicapBand: details.personalHandicapBand ?? null,
      };
      if (details.crew !== undefined && details.crew !== existing.crew) {
        entryUpdate.crew = details.crew;
      }
      await this.seriesEntryStore.updateEntry(existing.id, entryUpdate);
      return existing.id;
    }

    console.log(`EntryService: Adding series entry ${race.seriesName} index: ${race.index}`);

    try {
      return await this.mutator.createSeriesEntry({
        seriesId: race.seriesId,
        helm: details.helm,
        crew: details.crew,
        boatClass: details.boatClass,
        sailNumber: details.sailNumber,
        handicaps,
        personalHandicapBand: details.personalHandicapBand,
        tags: details.tags ?? [],
      });
    } catch (err) {
      // The mutator runs an authoritative collision check that may surface a
      // duplicate the cached `findAllMatchingEntries` above missed (e.g. a
      // concurrent sign-on, or a stale store snapshot). Translate it to the
      // same `ScoreSmarterError` shape callers already handle.
      if (err instanceof SeriesEntryIdentityConflictError) {
        throw new ScoreSmarterError(
          `Cannot create series entry: another entry already exists for ` +
          `${describeIdentity(identity)} in series ${race.seriesId} ` +
          `(id ${err.collidingEntryId}).`,
        );
      }
      throw err;
    }
  }
}
