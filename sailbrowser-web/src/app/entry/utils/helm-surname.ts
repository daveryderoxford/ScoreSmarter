/** Letter-range buckets for kiosk helm surname filter (10 ranges across A–Z). */
export const HELM_LETTER_RANGES = [
  { id: 'A-B', label: 'A–B' },
  { id: 'C-D', label: 'C–D' },
  { id: 'E-F', label: 'E–F' },
  { id: 'G-H', label: 'G–H' },
  { id: 'I-K', label: 'I–K' },
  { id: 'L-M', label: 'L–M' },
  { id: 'N-P', label: 'N–P' },
  { id: 'Q-R', label: 'Q–R' },
  { id: 'S-T', label: 'S–T' },
  { id: 'U-Z', label: 'U–Z' },
] as const;

export type HelmLetterRangeId = (typeof HELM_LETTER_RANGES)[number]['id'];

/** Last word of the helm name, or the whole string when single-token. */
export function surnameOf(helm: string): string {
  const trimmed = helm.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] ?? trimmed;
}

/** Bucket id for a surname's first letter (A–Z); non-letters → U–Z. */
export function letterRangeForSurname(surname: string): HelmLetterRangeId {
  const first = surname.trim().charAt(0).toUpperCase();
  if (first < 'A' || first > 'Z') return 'U-Z';
  if (first <= 'B') return 'A-B';
  if (first <= 'D') return 'C-D';
  if (first <= 'F') return 'E-F';
  if (first <= 'H') return 'G-H';
  if (first <= 'K') return 'I-K';
  if (first <= 'M') return 'L-M';
  if (first <= 'P') return 'N-P';
  if (first <= 'R') return 'Q-R';
  if (first <= 'T') return 'S-T';
  return 'U-Z';
}

export function helmMatchesLetterRange(helm: string, rangeId: HelmLetterRangeId | null): boolean {
  if (!rangeId) return true;
  return letterRangeForSurname(surnameOf(helm)) === rangeId;
}

/** Display helm with surname last: "Alice Smith" → "Smith, Alice" */
export function formatHelmSurnameLast(helm: string): string {
  const trimmed = helm.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return trimmed;
  const surname = parts.pop()!;
  return `${surname}, ${parts.join(' ')}`;
}
