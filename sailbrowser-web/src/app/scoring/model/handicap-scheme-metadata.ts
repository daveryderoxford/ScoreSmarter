import { HANDICAP_SCHEMES, HandicapScheme } from './handicap-scheme';

export type HandicapAppliesTo = 'boat' | 'boatClass';

export interface HandicapSchemeMetadata {
  scheme: HandicapScheme;
  label: string;
  appliesTo: HandicapAppliesTo;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export const HANDICAP_SCHEME_METADATA: Record<HandicapScheme, HandicapSchemeMetadata> = {
  'Level Rating': {
    scheme: 'Level Rating',
    label: 'Level Rating',
    appliesTo: 'boatClass',
    min: 0.000001,
    max: 1000000,
    step: 0.0001,
    defaultValue: 1,
  },
  PY: {
    scheme: 'PY',
    label: 'PY',
    appliesTo: 'boatClass',
    min: 400,
    max: 1500,
    step: 1,
    defaultValue: 1000,
  },
  IRC: {
    scheme: 'IRC',
    label: 'IRC',
    appliesTo: 'boat',
    min: 0.650,
    max: 2.1,
    step: 0.001,
    defaultValue: 1,
  },
  Personal: {
    scheme: 'Personal',
    label: 'Personal',
    appliesTo: 'boat',
    min: 400,
    max: 1500,
    step: 1,
    defaultValue: 1000,
  },
};

const CONTROL_NAMES: Record<HandicapScheme, string> = {
  'Level Rating': 'levelRating',
  PY: 'py',
  IRC: 'irc',
  Personal: 'personal',
};

export function handicapControlName(scheme: HandicapScheme): string {
  return CONTROL_NAMES[scheme];
}

export function getHandicapSchemeMetadata(scheme: HandicapScheme): HandicapSchemeMetadata {
  return HANDICAP_SCHEME_METADATA[scheme];
}

export function getSchemesForTarget(
  supportedSchemes: HandicapScheme[] | undefined,
  appliesTo: HandicapAppliesTo
): HandicapScheme[] {
  const source = supportedSchemes && supportedSchemes.length > 0
    ? supportedSchemes
    : [...HANDICAP_SCHEMES];
  return source.filter(s => HANDICAP_SCHEME_METADATA[s].appliesTo === appliesTo);
}

