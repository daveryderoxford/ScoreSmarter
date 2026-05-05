import { DncCalculation } from 'app/club-tenant/model/club';
import { PublishedRace } from '../../published-results/model/published-race';
import { SeriesEntry } from '../../results-input/model/series-entry';
import { mergeKeyFor, type MergeStrategy } from './merge-key';

function entryKeysThatRaced(races: PublishedRace[]): Set<string> {
  const raced = new Set<string>();
  for (const race of races) {
    for (const result of race.results) {
      raced.add(result.competitorKey);
    }
  }
  return raced;
}

function mergeGroupKeys(seriesEntries: SeriesEntry[], mergeStrategy: MergeStrategy): Set<string> {
  const keys = new Set<string>();
  for (const entry of seriesEntries) {
    keys.add(mergeKeyFor(entry, mergeStrategy));
  }
  return keys;
}

export function computeDncPoints(
  policy: DncCalculation,
  races: PublishedRace[],
  seriesEntries: SeriesEntry[],
  mergeStrategy: MergeStrategy,
): number {
  const allKeys = mergeGroupKeys(seriesEntries, mergeStrategy);
  const racedKeys = entryKeysThatRaced(races);

  const eligibleKeys = policy.excludeNeverRaced
    ? new Set(Array.from(allKeys).filter(key => racedKeys.has(key)))
    : allKeys;

  if (policy.basis === 'SeriesEntries') {
    return Math.max(1, eligibleKeys.size + policy.offset);
  }

  let maxRaceCompetitors = 0;
  for (const race of races) {
    const keysInRace = new Set(race.results.map(result => result.competitorKey));
    let eligibleInRace = 0;
    for (const key of keysInRace) {
      if (eligibleKeys.has(key)) {
        eligibleInRace++;
      }
    }
    maxRaceCompetitors = Math.max(maxRaceCompetitors, eligibleInRace);
  }

  return Math.max(1, maxRaceCompetitors + policy.offset);
}
