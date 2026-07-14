/**
 * Default sheet → club class aliases (kept in sync with
 * firebase/functions/.../class-aliases.ts). Used so review matching works even
 * when the model returns sheet text like "Radial" instead of "ILCA 6".
 */
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
] as const;

function pairsToAliasRecord(pairs: readonly string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    record[pairs[i]] = pairs[i + 1].trim();
  }
  return record;
}

export const defaultClassAliasRecord = pairsToAliasRecord(defaultClassAliases);

function normalizeAliasKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

/** Map sheet/OCR class text to canonical club class; returns trimmed input if no alias. */
export function resolveClassAlias(
  name: string | undefined | null,
  aliases: Record<string, string> = defaultClassAliasRecord,
): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return '';
  if (aliases[trimmed]) return aliases[trimmed];

  const key = normalizeAliasKey(trimmed);
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (normalizeAliasKey(alias) === key) return canonical;
  }
  return trimmed;
}
