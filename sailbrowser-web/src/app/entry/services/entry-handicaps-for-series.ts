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

/**
 * Builds the `Handicap[]` stored on a series entry / race competitor for a given series,
 * using form overrides, then club class defaults, then per-scheme metadata defaults.
 */
export function buildHandicapsForSeriesEntry(
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
