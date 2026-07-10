export const defaultClassAliases = [
  'A5', 'Aero 5',
  'A6', 'Aero 6',
  'A7', 'Aero 7',
  'A9', 'Aero 9',
  '5', 'Aero 5',
  '6', 'Aero 6',
  '7', 'Aero 7',
  '9', 'Aero 9',
  'L', 'ILCA 7',
  'LR', 'ILCA 6',
  'L47', 'ILCA 4',
  'Laser', 'ILCA 7',
  'Radial', 'ILCA 6',
  'Laser R', 'ILCA 6',
  'Laser 4.7', 'ILCA 4',
  '4.7', 'ILCA 4',
  '200', 'RS200',
  '300', 'RS300',
  '400', 'RS400',
  '500', 'RS500',
  '600', 'RS600',
  'Top', 'Topper',
  'T', 'Topper',
];

export function pairsToAliasRecord(pairs: readonly string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    record[pairs[i]] = pairs[i + 1].trim();
  }
  return record;
}

export const defaultClassAliasRecord = pairsToAliasRecord(defaultClassAliases);

export function hasAliasOverrides(overrides?: Record<string, string>): boolean {
  return !!overrides && Object.keys(overrides).length > 0;
}

/** Default aliases plus any non-empty client overrides. Treats `{}` as no overrides. */
export function mergeClassAliases(overrides?: Record<string, string>): Record<string, string> {
  if (!hasAliasOverrides(overrides)) {
    return { ...defaultClassAliasRecord };
  }
  return { ...defaultClassAliasRecord, ...overrides };
}
