/** String compatisopn function that first notmalised the strings  */
export function normalisedCompare(a: string | undefined | null, b: string | undefined | null): number {
   return (normaliseString(a).localeCompare(normaliseString(b)));
}

/** Normalises a string for comparision by triming, 
 * removing whitespece and lower casing it 
 */
export function normaliseString(str: string | undefined | null): string {
   return str?.toLowerCase().replace(/\s+/g, '')  || '';
}

/**
 * Tidies user-entered text for storage: trims it and collapses runs of whitespace
 * (including tabs and non-breaking spaces) to a single space. Apply when saving names
 * so stored values compare exactly.
 */
export function normaliseWhitespace(text: string | undefined | null): string {
   return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Number of single-character edits (insert, delete, replace, or swap of neighbours) between two strings. */
export function editDistance(s: string, t: string): number {
  const d: number[][] = Array.from({ length: s.length + 1 }, (_, i) =>
    Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[s.length]![t.length]!;
}
