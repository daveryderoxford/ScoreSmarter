import { Boat } from 'app/boats/model/boat';
import { normalizeSailNumber, sailNumbersEqual } from 'app/boats/model/sail-number';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';
import { ScannedResultRow } from '../model/scan-model';
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
  if (row.matchedCompetitorId || !sources.race || !hasReadableIdentity(row)) {
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

export function scanRowIdentityKey(row: ScannedResultRow): string {
  return [
    row.rowIndex,
    row.raceId ?? '',
    row.boatClass?.value ?? '',
    row.sailNumber?.value ?? '',
  ].join('|');
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
