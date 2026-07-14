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

function normalizeAliasKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

/**
 * Map a sheet/OCR class name to its canonical club class via aliases.
 * Returns the trimmed input when no alias matches.
 */
export function resolveClassAlias(
  name: string | undefined | null,
  aliases: Record<string, string> = defaultClassAliasRecord,
): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "";
  if (aliases[trimmed]) return aliases[trimmed];

  const key = normalizeAliasKey(trimmed);
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (normalizeAliasKey(alias) === key) return canonical;
  }
  return trimmed;
}

type MutableScannedStringField = {
  value?: unknown;
  alternatives?: unknown;
};

/**
 * Rewrite boatClass.value through class aliases so review matching sees club names
 * (e.g. Radial → ILCA 6). Keeps the original sheet text in alternatives when remapped.
 */
export function normalizeBoatClasses(
  parsed: unknown,
  aliases: Record<string, string> = defaultClassAliasRecord,
): void {
  if (typeof parsed !== "object" || parsed === null) return;
  const scannedResults = (parsed as { scannedResults?: unknown }).scannedResults;
  if (!Array.isArray(scannedResults)) return;

  for (const row of scannedResults) {
    if (typeof row !== "object" || row === null) continue;
    const boatClass = (row as { boatClass?: MutableScannedStringField }).boatClass;
    if (typeof boatClass !== "object" || boatClass === null) continue;
    if (typeof boatClass.value !== "string") continue;

    const original = boatClass.value.trim();
    if (!original) continue;

    const resolved = resolveClassAlias(original, aliases);
    const rawAlts = Array.isArray(boatClass.alternatives) ? boatClass.alternatives : [];
    const seen = new Set<string>([normalizeAliasKey(resolved)]);
    const nextAlts: string[] = [];

    if (resolved !== original) {
      seen.add(normalizeAliasKey(original));
      nextAlts.push(original);
    }

    for (const alt of rawAlts) {
      if (typeof alt !== "string") continue;
      const trimmedAlt = alt.trim();
      if (!trimmedAlt) continue;
      const altResolved = resolveClassAlias(trimmedAlt, aliases);
      // Keep sheet-form text when it aliases to the new primary; otherwise store canonical.
      const display =
        trimmedAlt !== altResolved && altResolved === resolved ? trimmedAlt : altResolved;
      if (!display || seen.has(normalizeAliasKey(display))) continue;
      seen.add(normalizeAliasKey(display));
      seen.add(normalizeAliasKey(altResolved));
      nextAlts.push(display);
    }

    boatClass.value = resolved;
    boatClass.alternatives = nextAlts;
  }
}
