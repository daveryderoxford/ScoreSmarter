import type { BoatClass } from '../../club-tenant/model/boat-class';
import type { Series } from '../../race-calender/model/series';
import type { Handicap } from '../../scoring/model/handicap';
import { getHandicapValue } from '../../scoring/model/handicap';
import { handicapSchemesRequiredForSeries } from '../../scoring/model/handicap-race-requirements';
import type { HandicapScheme } from '../../scoring/model/handicap-scheme';
import { getHandicapSchemeMetadata } from '../../scoring/model/handicap-scheme-metadata';

export interface EntryHandicapSource {
  boatClassName: string;
  handicaps?: Handicap[];
}

export interface PrimaryFleetEligibilityEntry {
  boatClass: string;
  handicaps: Handicap[];
}

/**
 * Resolves the `Handicap[]` for a given series using:
 * 1) source overrides,
 * 2) club class defaults,
 * 3) per-scheme metadata defaults.
 */
export function resolveHandicapsForSeries(
  series: Series,
  source: EntryHandicapSource,
  clubClasses: BoatClass[]
): Handicap[] {
  const boatClass = clubClasses.find(c => c.name === source.boatClassName);
  const schemes = handicapSchemesRequiredForSeries(series);

  return schemes.map((scheme: HandicapScheme) => {
    const meta = getHandicapSchemeMetadata(scheme);
    const entry = source.handicaps?.find(h => h.scheme === scheme);
    const overrideValid = entry && entry.value > 0 ? entry.value : undefined;
    const overridePresentButInvalid = entry !== undefined && !(entry.value > 0);
    const fromClass = getHandicapValue(boatClass?.handicaps, scheme);

    let chosen: number;
    if (overrideValid !== undefined) {
      chosen = overrideValid;
    } else if (overridePresentButInvalid) {
      chosen = meta.defaultValue;
    } else {
      chosen = fromClass ?? meta.defaultValue;
    }

    const value = typeof chosen === 'number' && chosen > 0 ? chosen : meta.defaultValue;
    return { scheme, value };
  });
}

/**
 * Returns true when an entry satisfies a series' primary fleet rule.
 */
export function meetsPrimaryFleetEligibility(
  series: Series,
  entry: PrimaryFleetEligibilityEntry
): boolean {
  const config = series.primaryScoringConfiguration;
  const fleet = config.fleet;

  switch (fleet.type) {
    case 'GeneralHandicap':
      return getHandicapValue(entry.handicaps, config.handicapScheme) != null;
    case 'BoatClass':
      return entry.boatClass === fleet.boatClassId;
    case 'HandicapRange': {
      const value = getHandicapValue(entry.handicaps, fleet.scheme);
      return value != null && value >= fleet.min && value <= fleet.max;
    }
    case 'Tag':
      return false;
  }
}
