import type { Race, Series } from 'app/race-calender';
import type { HandicapScheme } from './handicap-scheme';
import type { ScoringConfiguration } from './scoring-configuration';

function addSchemesFromConfiguration(config: ScoringConfiguration, out: Set<HandicapScheme>): void {
  if (config.type === 'LevelRating') {
    out.add('Level Rating');
  } else {
    out.add(config.handicapScheme);
  }
}

/** Handicap schemes referenced by a series’ primary and secondary scoring configurations. */
export function handicapSchemesRequiredForSeries(series: Series): HandicapScheme[] {
  const out = new Set<HandicapScheme>();
  addSchemesFromConfiguration(series.primaryScoringConfiguration, out);
  for (const s of series.secondaryScoringConfigurations ?? []) {
    addSchemesFromConfiguration(s, out);
  }
  return [...out];
}

/** Union of schemes required for all given races (via each race’s series). */
export function handicapSchemesRequiredForRaces(
  races: Race[] | null | undefined,
  allSeries: Series[]
): HandicapScheme[] {
  if (!races?.length) return [];
  const seriesById = new Map(allSeries.map(s => [s.id, s]));
  const schemes = new Set<HandicapScheme>();
  for (const race of races) {
    const series = seriesById.get(race.seriesId);
    if (!series) continue;
    for (const s of handicapSchemesRequiredForSeries(series)) {
      schemes.add(s);
    }
  }
  return [...schemes];
}

/** If the club lists supported schemes, require intersection; otherwise allow all required schemes. */
export function schemesRequiredAndSupportedByClub(
  required: HandicapScheme[],
  supported: HandicapScheme[] | undefined | null
): HandicapScheme[] {
  if (!supported?.length) return required;
  return required.filter(s => supported.includes(s));
}
