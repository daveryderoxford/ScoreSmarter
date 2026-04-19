import type { Race } from 'app/race-calender/model/race';
import { doesRaceRequireHandicap } from 'app/race-calender/model/race-type';
import type { RaceCompetitor, SeriesEntry } from 'app/results-input';
import type { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import type { ResultCode } from 'app/scoring/model/result-code';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { isInFleet } from 'app/scoring/services/fleet-scoring';

const NOT_FINISHED: ResultCode = 'NOT FINISHED';

export { doesRaceRequireHandicap };

/** 
 * Returns Series entries to include in the series 
 * for a given ScoringConfiguration. 
 * To be incliuded
 * 1. The entry is in the fleet (handicap range, BoatClass, tag)
 * 2. The entry has a handicap value for the handicap scheme (if required)
 */
export function competitorsForConfigRace(
  race: Race,
  config: ScoringConfiguration,
  allSeriesCompetitors: RaceCompetitor[],
  seriesEntries: SeriesEntry[],
): RaceCompetitor[] {
  const handicapScheme = config.handicapScheme;
  return allSeriesCompetitors.filter(c => {
    if (c.raceId !== race.id) return false;
    const entry = seriesEntries.find(e => e.id === c.seriesEntryId);
    if (!entry) return false;
    return (
      isInFleet(entry, config.fleet) &&
      (!doesRaceRequireHandicap(race.type) || getHandicapValue(entry.handicaps, handicapScheme) != null)
    );
  });
}

/**
 * Whether this race should be scored for the given fleet configuration.
 *
 * ScoringEngine already restricts by race status (In progress, Completed, Published, Verified).
 * For the primary **GeneralHandicap** fleet, that is enough: the race only becomes In progress once someone has a
 * real result, and Completed means no row is still NOT_FINISHED.
 *
 * With **secondary scoring** (separate configs per fleet), the same race can be In progress because
 * another fleet has results while **every** competitor in *this* fleet is still NOT_FINISHED. Race
 * status does not distinguish fleets, so we still require at least one non–NOT FINISHED row in
 * `filtered` for non-GeneralHandicap fleets.
 */
export function isRaceScorable(
  race: Race,
  config: ScoringConfiguration,
  allSeriesCompetitors: RaceCompetitor[],
  seriesEntries: SeriesEntry[],
): boolean {
  const filtered = competitorsForConfigRace(race, config, allSeriesCompetitors, seriesEntries);
  if (filtered.length === 0) return true;
  if (config.fleet.type === 'GeneralHandicap') {
    return true;
  }
  // Secondary (or any non-All) fleet: see JSDoc — status alone cannot tell if this fleet has started.
  return filtered.some(c => c.resultCode !== NOT_FINISHED);
}
