import type { Race } from 'app/race-calender/model/race';
import { doesRaceRequireHandicap } from 'app/race-calender/model/race-type';
import type { RaceCompetitor, SeriesEntry } from 'app/results-input';
import { entryDivisionIds } from 'app/race-calender/model/division';
import type { ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import type { ResultCode } from 'app/scoring/model/result-code';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { isInFleet } from 'app/scoring/model/fleet-membership';

const NOT_FINISHED: ResultCode = 'NOT FINISHED';

export { doesRaceRequireHandicap };

export type EntryMembership =
  | { kind: 'fleet' }
  | { kind: 'division'; divisionId: string };

function entryMatchesMembership(entry: SeriesEntry, config: ScoringConfiguration, membership: EntryMembership): boolean {
  if (membership.kind === 'division') {
    return entryDivisionIds(entry).includes(membership.divisionId);
  }
  return isInFleet(entry, config.fleet);
}

export function seriesEntriesForConfig(
  seriesEntries: SeriesEntry[],
  config: ScoringConfiguration,
  requireHandicap: boolean,
  membership: EntryMembership = { kind: 'fleet' },
): SeriesEntry[] {
  const handicapScheme = config.handicapScheme;
  return seriesEntries.filter(e =>
    entryMatchesMembership(e, config, membership) &&
    (!requireHandicap || getHandicapValue(e.handicaps, handicapScheme) != null)
  );
}

export function competitorsForConfigRace(
  race: Race,
  config: ScoringConfiguration,
  allSeriesCompetitors: RaceCompetitor[],
  seriesEntries: SeriesEntry[],
  membership: EntryMembership = { kind: 'fleet' },
): RaceCompetitor[] {
  const handicapScheme = config.handicapScheme;
  return allSeriesCompetitors.filter(c => {
    if (c.raceId !== race.id) return false;
    const entry = seriesEntries.find(e => e.id === c.seriesEntryId);
    if (!entry) return false;
    return (
      entryMatchesMembership(entry, config, membership) &&
      (!doesRaceRequireHandicap(race.type) || getHandicapValue(entry.handicaps, handicapScheme) != null)
    );
  });
}

export function isRaceScorable(
  race: Race,
  config: ScoringConfiguration,
  allSeriesCompetitors: RaceCompetitor[],
  seriesEntries: SeriesEntry[],
  membership: EntryMembership = { kind: 'fleet' },
): boolean {
  const filtered = competitorsForConfigRace(race, config, allSeriesCompetitors, seriesEntries, membership);
  if (filtered.length === 0) return true;
  if (config.fleet.type === 'GeneralHandicap') {
    return true;
  }
  return filtered.some(c => c.resultCode !== NOT_FINISHED);
}
