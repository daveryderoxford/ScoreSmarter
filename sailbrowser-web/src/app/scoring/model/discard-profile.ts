/**
 * Discard schedule: `Series.discards` holds milestone race numbers (1-based); each entry adds one allowed discard
 * after that many races have been sailed. Scoring expands to a per-race allowance via {@link generateDiscardArray}.
 */

/**
 * App default: short-series schedule — no discard milestones until configured.
 */
export const DEFAULT_SHORT_DISCARDS: readonly number[] = [];

/**
 * App default: long-series schedule — milestones 3, 5, 9, 12, … (product default list).
 */
export const DEFAULT_LONG_DISCARDS: readonly number[] = [
  3, 5, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90,
  93, 96, 99, 102,
];

/** Positive integer race count, or 0 if missing / non-finite / not positive. */
function normaliseRaceCountLength(raceCount: number): number {
  const n = Math.floor(Number(raceCount));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/**
 * Cumulative allowable discards after each race count 1…N: count triggers with milestone ≤ race.
 */
export function generateDiscardArray(discards: readonly number[], totalNumRaces: number): number[] {
  const n = normaliseRaceCountLength(totalNumRaces);
  const sorted = [...discards]
    .filter(t => typeof t === 'number' && Number.isFinite(t) && Number.isInteger(t) && t >= 1)
    .sort((a, b) => a - b);
  const out: number[] = [];
  let j = 0;
  for (let race = 1; race <= n; race++) {
    while (j < sorted.length && sorted[j]! <= race) {
      j++;
    }
    out.push(j);
  }
  return out;
}

/** Row index is 1-based for messages. Empty list ⇒ valid. */
export function validateDiscardRaceSequence(triggers: readonly number[]): DiscardSeriesValidationIssue[] {
  const issues: DiscardSeriesValidationIssue[] = [];
  let prev = 1;
  for (let i = 0; i < triggers.length; i++) {
    const t = Number(triggers[i]);
    const rowIdx = i + 1;
    if (!Number.isFinite(t) || !Number.isInteger(t) || t < 1) {
      issues.push({ raceIndex: rowIdx, message: 'After Race must be a positive integer.' });
      continue;
    }
    if (i > 0 && t < prev) {
      issues.push({
        raceIndex: rowIdx,
        message: 'Each discard must trigger on or after the previous row (later “After Race”).',
      });
    }
    prev = t;
  }
  return issues;
}

/** Short sentence for UI from stored milestone list, e.g. `Discards gained at races 4, 7, 10`. */
export function formatDiscardScheduleSummary(triggers: readonly number[]): string {
  if (triggers.length === 0) {
    return 'No discards configured.';
  }
  return `Discards gained at races ${triggers.join(', ')}.`;
}

/**
 * Allowed discards after `raceIndex` races completed. Uses stored milestone list + {@link generateDiscardArray}.
 */
export function discardsForRaceIndex(series: { discards: readonly number[] }, raceIndex: number): number {
  const n = normaliseRaceCountLength(raceIndex);
  if (n <= 0) return 0;
  const row = generateDiscardArray(series.discards, n);
  return row[n - 1] ?? 0;
}

export interface DiscardSeriesValidationIssue {
  raceIndex: number;
  message: string;
}
