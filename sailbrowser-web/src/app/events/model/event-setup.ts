import { addDays, isAfter, startOfDay } from 'date-fns';
import { type Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import type { Race } from 'app/race-calendar/model/race';
import type { Series } from 'app/race-calendar/model/series';
import { defaultDiscardsForNewSeries, type SeriesDiscardDefaultsSource } from 'app/scoring/model/discard-profile';
import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getConfigName, type ScoringConfiguration } from 'app/scoring/model/scoring-configuration';
import { dateAtSecondsOfDay } from 'app/shared/utils/time-utils';

/** Handicap scheme a new event series scores with: fixed by the fleet, else the club's first non-level scheme. */
export function eventHandicapScheme(fleet: Fleet, clubSchemes: readonly HandicapScheme[]): HandicapScheme {
  switch (fleet.type) {
    case 'BoatClass':
      return 'Level Rating';
    case 'HandicapRange':
      return fleet.scheme;
    case 'GeneralHandicap':
      return clubSchemes.find(s => s !== 'Level Rating') ?? 'PY';
  }
}

export function scoringConfigurationForFleet(fleet: Fleet, clubSchemes: readonly HandicapScheme[]): ScoringConfiguration {
  const scheme = eventHandicapScheme(fleet, clubSchemes);
  const name = getConfigName(scheme, fleet) ?? scheme;
  return scheme === 'Level Rating'
    ? { id: 'overall', name, type: 'LevelRating', fleet, handicapScheme: 'Level Rating' }
    : { id: 'overall', name, type: 'Handicap', fleet, handicapScheme: scheme };
}

export function raceTypeForFleet(fleet: Fleet): Race['type'] {
  return fleet.type === 'BoatClass' ? 'Level Rating' : 'Handicap';
}

/** A short series for one fleet at the event. Name is "{event} {fleet}". */
export function eventSeriesFor(
  event: { id: string; name: string; seasonId: string },
  fleet: Fleet,
  club: SeriesDiscardDefaultsSource & { supportedHandicapSchemes?: readonly HandicapScheme[] },
): Partial<Series> {
  return {
    seasonId: event.seasonId,
    name: `${event.name} ${getFleetName(fleet)}`,
    displayGroup: event.name,
    eventId: event.id,
    archived: false,
    scoringAlgorithm: 'short',
    entryAlgorithm: 'helm',
    discards: defaultDiscardsForNewSeries('short', club),
    primaryScoringConfiguration: scoringConfigurationForFleet(fleet, club.supportedHandicapSchemes ?? []),
    secondaryScoringConfigurations: [],
    divisions: [],
  };
}

/** Scheduled starts: `racesPerDay` races on every day from `firstDay` to `lastDay` inclusive. */
export function eventRaceStarts(
  firstDay: Date,
  lastDay: Date,
  firstStartSeconds: number,
  racesPerDay: number,
): Date[] {
  const starts: Date[] = [];
  const last = startOfDay(lastDay);
  for (let day = startOfDay(firstDay); !isAfter(day, last); day = addDays(day, 1)) {
    const start = dateAtSecondsOfDay(day, firstStartSeconds);
    for (let i = 0; i < racesPerDay; i++) starts.push(start);
  }
  return starts;
}
