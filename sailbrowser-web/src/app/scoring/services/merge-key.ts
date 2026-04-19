import type { SeriesEntry } from 'app/results-input/model/series-entry';
import type { SeriesEntryMatchingStrategy } from 'app/entry/model/entry-grouping';

/**
 * Identifier used to group SeriesEntry rows into a single competitor for
 * series-level aggregation.
 *
 * Per-hull SeriesEntries are always created at sign-on (one per
 * boatClass+sailNumber+helm). The series-level `entryAlgorithm` controls only
 * how those per-hull entries are merged when scoring the series:
 *
 *   - `classSailNumberHelm` / `regatta` -> no merge (key = entry.id)
 *   - `classSailNumber`                  -> merge boats sailed by different
 *                                            helms in the same hull
 *   - `helm`                             -> merge entries that share a helm
 *
 * `mergeKeyFor` deliberately uses normalised (trimmed, case-insensitive)
 * helm/class strings so trivial typo variants don't split a competitor.
 */
export type CompetitorKey = string;

export type MergeStrategy = SeriesEntryMatchingStrategy;

export function mergeKeyFor(
  entry: Pick<SeriesEntry, 'id' | 'helm' | 'boatClass' | 'sailNumber'>,
  strategy: MergeStrategy,
): CompetitorKey {
  switch (strategy) {
    case 'classSailNumberHelm':
    case 'regatta':
      return entry.id;
    case 'classSailNumber':
      return `cs#${normClass(entry.boatClass)}#${entry.sailNumber}`;
    case 'helm':
      return `h#${normHelm(entry.helm)}`;
  }
}

const normHelm = (s: string | undefined) => (s ?? '').trim().toLowerCase();
const normClass = (s: string | undefined) => (s ?? '').trim().toLowerCase();
