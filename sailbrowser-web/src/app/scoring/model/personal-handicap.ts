import type { HandicapScheme } from './handicap-scheme';

export const PERSONAL_HANDICAP_BANDS = [
  'Band0',
  'Band1',
  'Band2',
  'Band3',
  'Band4',
  'Band5',
] as const;

export type PersonalHandicapBand = (typeof PERSONAL_HANDICAP_BANDS)[number];

export const PERSONAL_HANDICAP_BAND_MULTIPLIER: Readonly<Record<PersonalHandicapBand, number>> = {
  Band0: 1.0,
  Band1: 1.03,
  Band2: 1.06,
  Band3: 1.09,
  Band4: 1.12,
  Band5: 1.15,
};

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
