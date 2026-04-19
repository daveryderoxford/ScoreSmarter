import { SeriesEntry } from '../../results-input/model/series-entry';
import { PublishedRace } from 'app/published-results';

/**
 * Gets all the unique competitor keys for a set of series entries.
 * The key is a composite of helm, sail number, and boat class.
 *
 * Identity now lives on `SeriesEntry`. Per-race `RaceCompetitor` rows no
 * longer carry helm / boatClass / sailNumber, so callers should pass the
 * resolved series entries.
 */
export function getAllCompetitorKeys(entries: SeriesEntry[]): Set<string> {
  const keys = new Set<string>();
  entries.forEach(e => keys.add(`${e.helm}-${e.sailNumber}-${e.boatClass}`));
  return keys;
}

/**
 * Gets all the unique competitor keys from an array of already published races.
 */
export function getAllCompetitorKeysFromPublished(races: PublishedRace[]): Set<string> {
  const keys = new Set<string>();
  races.forEach(race =>
    race.results.forEach(res => keys.add(`${res.helm}-${res.sailNumber}-${res.boatClass}`)));
  return keys;
}
