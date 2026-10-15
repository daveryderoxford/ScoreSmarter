import { editDistance } from 'app/shared/utils/string-utils';

/**
 * Canonical form for comparing helm names: lower case, accents removed,
 * punctuation (`.`, `,`, apostrophes) removed and whitespace collapsed.
 */
export function normalizeHelmName(raw: string | undefined | null): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,'\u2019]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when both names are present and equal after normalization. */
export function helmNamesEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = normalizeHelmName(a);
  return !!na && na === normalizeHelmName(b);
}

/** Last word of the helm name, or the whole string when single-token. */
export function surnameOf(helm: string): string {
  const trimmed = helm.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] ?? trimmed;
}

/**
 * The single candidate whose helm matches `scanned`, trying progressively looser rules:
 * 1. the same name;
 * 2. the same surname with the forename, an initial or a shortened forename
 *    ("J Smith", "Smith J", "Jo Smith"); "Jane Smith" does not match "John Smith";
 * 3. the surname alone ("Smith");
 * 4. a minor misspelling ("Jon Smith", "John Smyth"): one edit, or two for names of 8+ letters.
 * Returns undefined when nothing matches or the first rule that matches finds several candidates.
 */
export function findHelmNameMatch<T>(
  scanned: string | undefined | null,
  candidates: readonly T[],
  helmOf: (candidate: T) => string,
): T | undefined {
  const scannedTokens = helmTokens(scanned);
  if (scannedTokens.length === 0) return undefined;

  const rules: ((candidate: string[]) => boolean)[] = [
    c => c.join(' ') === scannedTokens.join(' '),
    c => initialAndSurnameMatch(scannedTokens, c),
    c => scannedTokens.length === 1 && c.length > 1 && c[c.length - 1] === scannedTokens[0],
    c => minorMisspelling(scannedTokens.join(' '), c.join(' ')),
  ];

  for (const rule of rules) {
    const matches = candidates.filter(c => rule(helmTokens(helmOf(c))));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return undefined;
  }
  return undefined;
}

function helmTokens(name: string | undefined | null): string[] {
  const normalized = normalizeHelmName(name);
  return normalized ? normalized.split(' ') : [];
}

function minorMisspelling(scanned: string, candidate: string): boolean {
  const allowed = Math.min(scanned.length, candidate.length) >= 8 ? 2 : 1;
  return editDistance(scanned, candidate) <= allowed;
}

function initialAndSurnameMatch(scanned: string[], candidate: string[]): boolean {
  if (scanned.length < 2 || candidate.length < 2) return false;
  const first = candidate[0]!;
  const surname = candidate[candidate.length - 1]!;
  const scannedFirst = scanned[0]!;
  const scannedLast = scanned[scanned.length - 1]!;
  const forenameMatches = (token: string) => first.startsWith(token);
  return (scannedLast === surname && forenameMatches(scannedFirst)) ||
    (scannedFirst === surname && forenameMatches(scannedLast));
}
