import { Boat } from 'app/boats/model/boat';
import { normalizeSailNumber, sailNumbersEqual } from 'app/boats/model/sail-number';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { PendingScanEntry, ScannedResultRow } from '../model/scan-model';
import { boatClassesMatch } from './scan-row-matching.service';

export interface ScanRowRaceRef {
  id: string;
  seriesId: string;
}

export interface ScanRowIdentitySources {
  race: ScanRowRaceRef | null;
  competitors: readonly ResolvedRaceCompetitor[];
  seriesEntries: readonly SeriesEntry[];
  boats: readonly Boat[];
}

export type ScanRowIdentityPlan =
  | { kind: 'link'; competitorId: string }
  | { kind: 'sign-on-entry'; entry: SeriesEntry }
  | { kind: 'sign-on-boat'; boat: Boat }
  | { kind: 'choose-entry'; entries: SeriesEntry[] }
  | { kind: 'choose-boat'; boats: Boat[] }
  | { kind: 'create' }
  | { kind: 'skip' };

/**
 * Decide how a scanned row becomes a race competitor.
 * Series entries for the race's series win over the boat register.
 * A single match can be applied automatically. Several helms stay for the user.
 */
export function classifyScanRow(
  row: ScannedResultRow,
  sources: ScanRowIdentitySources,
): ScanRowIdentityPlan {
  if (row.matchedCompetitorId || row.pendingEntry || !sources.race || !hasReadableIdentity(row)) {
    return { kind: 'skip' };
  }

  const boatClass = row.boatClass?.value ?? '';
  const sailNumber = normalizeSailNumber(row.sailNumber?.value);

  const racing = sources.competitors.filter(c =>
    c.raceId === sources.race!.id &&
    boatClassesMatch(c.boatClass, boatClass) &&
    sailNumbersEqual(c.sailNumber, sailNumber),
  );
  if (racing.length === 1) return { kind: 'link', competitorId: racing[0]!.id };
  if (racing.length > 1) return { kind: 'skip' };

  const entries = sources.seriesEntries.filter(e =>
    e.seriesId === sources.race!.seriesId &&
    boatClassesMatch(e.boatClass, boatClass) &&
    sailNumbersEqual(e.sailNumber, sailNumber),
  );
  if (entries.length === 1) return { kind: 'sign-on-entry', entry: entries[0]! };
  if (entries.length > 1) return { kind: 'choose-entry', entries };

  const boats = sources.boats.filter(b =>
    boatClassesMatch(b.boatClass, boatClass) &&
    sailNumbersEqual(b.sailNumber, sailNumber),
  );
  if (boats.length === 1) return { kind: 'sign-on-boat', boat: boats[0]! };
  if (boats.length > 1) return { kind: 'choose-boat', boats };

  return { kind: 'create' };
}

/** Unique matches with a confident sail read can be signed on without a dialog. */
export function canAutoApplyScanIdentity(row: ScannedResultRow, plan: ScanRowIdentityPlan): boolean {
  if (row.sailNumber?.confidence !== 'HIGH') return false;
  return plan.kind === 'link' || plan.kind === 'sign-on-entry' || plan.kind === 'sign-on-boat';
}

export interface AutoMatchSources {
  /** Race the row is scored in, or null when it cannot be resolved. */
  raceFor: (row: ScannedResultRow) => ScanRowRaceRef | null;
  competitors: readonly ResolvedRaceCompetitor[];
  seriesEntries: readonly SeriesEntry[];
  boats: readonly Boat[];
  /** True when signing on the entry would clash with an existing race entry. */
  conflictsInRace: (entry: PendingScanEntry, raceId: string) => boolean;
}

/**
 * Applies automatic matches to rows the user has not resolved. A confident,
 * unique match links to the race competitor or stages the entry. Staging is
 * skipped when it would clash with a race entry or with another staged row.
 */
export function applyAutomaticMatches(
  rows: readonly ScannedResultRow[],
  sources: AutoMatchSources,
): ScannedResultRow[] {
  const staged: { raceId: string; entry: PendingScanEntry }[] = [];
  for (const row of rows) {
    const race = sources.raceFor(row);
    if (row.pendingEntry && race) staged.push({ raceId: race.id, entry: row.pendingEntry });
  }

  return rows.map(row => {
    if (row.matchedCompetitorId || row.pendingEntry || row.autoMatchDismissed) return row;
    const race = sources.raceFor(row);
    const plan = classifyScanRow(row, { ...sources, race });
    if (!race || !canAutoApplyScanIdentity(row, plan)) return row;
    if (plan.kind === 'link') return { ...row, matchedCompetitorId: plan.competitorId };

    const entry = plan.kind === 'sign-on-entry'
      ? entryDetailsFromSeriesEntry(plan.entry)
      : plan.kind === 'sign-on-boat'
        ? entryDetailsFromBoat(plan.boat)
        : null;
    if (!entry) return row;
    if (staged.some(s => s.raceId === race.id && sameStagedIdentity(s.entry, entry))) return row;
    if (sources.conflictsInRace(entry, race.id)) return row;
    staged.push({ raceId: race.id, entry });
    return { ...row, pendingEntry: entry };
  });
}

/** Same boat and helm, so the two entries would create the same race competitor. */
export function sameStagedIdentity(a: PendingScanEntry, b: PendingScanEntry): boolean {
  return boatClassesMatch(a.boatClass, b.boatClass) &&
    sailNumbersEqual(a.sailNumber, b.sailNumber) &&
    a.helm.trim().toLowerCase() === b.helm.trim().toLowerCase();
}

export function entryDetailsFromSeriesEntry(entry: SeriesEntry): PendingScanEntry {
  return {
    helm: entry.helm,
    crew: entry.crew,
    club: entry.club,
    boatName: entry.boatName,
    boatClass: entry.boatClass,
    sailNumber: entry.sailNumber,
    handicaps: entry.handicaps,
    personalHandicapBand: entry.personalHandicapBand,
    divisions: entry.divisions,
  };
}

export function entryDetailsFromBoat(boat: Boat): PendingScanEntry {
  return {
    helm: boat.helm,
    crew: boat.crew,
    boatName: boat.name,
    boatClass: boat.boatClass,
    sailNumber: boat.sailNumber,
    handicaps: boat.handicaps,
    personalHandicapBand: boat.personalHandicapBand,
  };
}

function hasReadableIdentity(row: ScannedResultRow): boolean {
  const boatClass = row.boatClass?.value?.trim();
  const sailNumber = normalizeSailNumber(row.sailNumber?.value);
  if (!boatClass || !sailNumber) return false;
  const blocked = new Set(['FAILED', 'AMBIGUOUS']);
  if (blocked.has(row.sailNumber?.confidence ?? '')) return false;
  if (blocked.has(row.boatClass?.confidence ?? '')) return false;
  return true;
}
