import type { BoatClass } from '../../club-tenant/model/boat-class';
import { classRating } from '../../club-tenant/model/club-class';
import { seriesRatingDate, type RatingList } from '../../club-tenant/model/rating-list';
import type { Series } from '../../race-calender/model/series';
import type { Handicap } from '../../scoring/model/handicap';
import { getHandicapValue } from '../../scoring/model/handicap';
import { handicapSchemesRequiredForSeries } from '../../scoring/model/handicap-race-requirements';
import { calculatePersonalHandicapFromPy, type PersonalHandicapBand, toUnknownHandicapValue } from '../../scoring/model/personal-handicap';
import type { HandicapScheme } from '../../scoring/model/handicap-scheme';
import { getHandicapSchemeMetadata } from '../../scoring/model/handicap-scheme-metadata';

export interface EntryHandicapSource {
  boatClassName: string;
  handicaps?: Handicap[];
  personalHandicapBand?: PersonalHandicapBand;
  personalHandicapUnknown?: boolean;
}

export interface PrimaryFleetEligibilityEntry {
  boatClass: string;
  handicaps: Handicap[];
}

/** Host club label for member / club-boat series entries (short name preferred). */
export function hostClubLabel(club: { name: string; shortName?: string }): string {
  const short = club.shortName?.trim();
  return short || club.name;
}

/**
 * Club stored on a new series entry by sign-on category.
 * Visitors: optional typed club. Member/club boats: host short name (else name).
 */
export function entryClubForCategory(
  category: 'member' | 'club' | 'visitor',
  visitorClub: string | undefined | null,
  hostClub: { name: string; shortName?: string },
): string | undefined {
  if (category === 'visitor') {
    const trimmed = visitorClub?.trim();
    return trimmed || undefined;
  }
  return hostClubLabel(hostClub);
}

/**
 * Resolves the `Handicap[]` for a given series using:
 * 1) source overrides,
 * 2) the class rating: from the rating list in force on the series start date for RYA
 *    classes that don't override the scheme, otherwise the club's value,
 * 3) per-scheme metadata defaults.
 */
export function resolveHandicapsForSeries(
  series: Series,
  source: EntryHandicapSource,
  clubClasses: BoatClass[],
  ratingLists: readonly RatingList[],
): Handicap[] {
  const boatClass = clubClasses.find(c => c.name === source.boatClassName);
  const schemes = handicapSchemesRequiredForSeries(series);
  const date = seriesRatingDate(series);
  const classValue = (scheme: HandicapScheme) =>
    boatClass ? classRating(boatClass, scheme, ratingLists, date) : undefined;
  const classPy = classValue('PY');
  const sourcePy = getHandicapValue(source.handicaps, 'PY') ?? classPy;

  return schemes.map((scheme: HandicapScheme) => {
    if (scheme === 'Personal') {
      if (source.personalHandicapUnknown) {
        return { scheme, value: toUnknownHandicapValue('Personal') };
      }
      if (source.personalHandicapBand && sourcePy && sourcePy > 0) {
        return {
          scheme,
          value: calculatePersonalHandicapFromPy(sourcePy, source.personalHandicapBand),
        };
      }
    }

    const meta = getHandicapSchemeMetadata(scheme);
    const entry = source.handicaps?.find(h => h.scheme === scheme);
    const overrideValid = entry && entry.value > 0 ? entry.value : undefined;
    const overridePresentButInvalid = entry !== undefined && !(entry.value > 0);
    const fromClass = classValue(scheme);

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
      return true;
    case 'BoatClass':
      return entry.boatClass === fleet.boatClassId;
    case 'HandicapRange': {
      const value = getHandicapValue(entry.handicaps, fleet.scheme);
      return value != null && value >= fleet.min && value <= fleet.max;
    }
  }
}
