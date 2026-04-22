import type { HandicapScheme } from './handicap-scheme';

/**
 * Personal handicap bands.
 *
 * The handicap for a boat on `Band<n>` is derived from its PY rating as:
 *     Band<n> multiplier = 1 + 0.05 * n
 * so a higher band means a slower boat (larger handicap number).
 *
 * We currently publish five bands, Band0..Band4 (no handicap penalty up to +20%).
 */
export const PERSONAL_HANDICAP_BANDS = [
  'Band0',
  'Band1',
  'Band2',
  'Band3',
  'Band4',
] as const;

export type PersonalHandicapBand = (typeof PERSONAL_HANDICAP_BANDS)[number];

/** Multiplier applied to PY to derive a Personal handicap, by band. */
export const PERSONAL_HANDICAP_BAND_MULTIPLIER: Readonly<Record<PersonalHandicapBand, number>> =
  Object.freeze(
    PERSONAL_HANDICAP_BANDS.reduce((acc, band, index) => {
      acc[band] = 1 + 0.05 * index;
      return acc;
    }, {} as Record<PersonalHandicapBand, number>),
  );

export const UNKNOWN_HANDICAP_VALUE_BY_SCHEME: Readonly<Record<HandicapScheme, number>> = {
  'Level Rating': 900001,
  PY: 900002,
  IRC: 900003,
  Personal: 900004,
};

export function isUnknownHandicapValue(scheme: HandicapScheme, value: number | undefined): boolean {
  if (value == null) return false;
  return value === UNKNOWN_HANDICAP_VALUE_BY_SCHEME[scheme];
}

export function toUnknownHandicapValue(scheme: HandicapScheme): number {
  return UNKNOWN_HANDICAP_VALUE_BY_SCHEME[scheme];
}

export function calculatePersonalHandicapFromPy(py: number, band: PersonalHandicapBand): number {
  const multiplier = PERSONAL_HANDICAP_BAND_MULTIPLIER[band];
  return Math.round(py * multiplier);
}
