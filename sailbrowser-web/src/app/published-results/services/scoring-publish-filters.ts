import type { Race } from 'app/race-calender/model/race';
import type { RaceCompetitor, SeriesEntry } from 'app/results-input';
import type { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import type { ResultCode } from 'app/scoring/model/result-code';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { isInFleet } from 'app/scoring/services/fleet-scoring';

const NOT_FINISHED: ResultCode = 'NOT FINISHED';

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
      getHandicapValue(c.handicaps, handicapScheme) != null
    );
  });
}

/** 
 * Should the race be scored. 
 * Races with no entries or where everyone has a result code of 
 * NOT_FINISHED are excluded from scoring. 
 * */
export function isRaceScorable(
  race: Race,
  config: ScoringConfiguration,
  allSeriesCompetitors: RaceCompetitor[],
  seriesEntries: SeriesEntry[],
): boolean {
  const filtered = competitorsForConfigRace(race, config, allSeriesCompetitors, seriesEntries);
  if (filtered.length === 0) return true;
  return filtered.some(c => c.resultCode !== NOT_FINISHED);
}
