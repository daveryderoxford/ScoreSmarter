/** Shared functionality between series and results tables */

export interface HelmCrew  {
   helm: string;
   crew?: string;
}

const MAX_NAME_WIDTH = 160;
const MIN_NAME_WIDTH = 64;
const NAME_WIDTH_SCALE = 0.8;

export function nameColumnWidth(names: HelmCrew[]) {

   if (!names || names.length === 0) {
      return MIN_NAME_WIDTH + 'px'; 
   }

   // Find the length of the longesst name (helm or crew)
   const maxLenChars = names.reduce((maxLength, competitor) => {
      const helmLength = competitor.helm?.length || 0;
      const crewLength = competitor.crew?.length || 0;
      return Math.max(maxLength, helmLength, crewLength);
   }, 0);

   // Estimate width: (char count * avg char width) + padding, then scale down.
   let maxLenPixels = (maxLenChars * 8 + 15) * NAME_WIDTH_SCALE;
   maxLenPixels = Math.min(MAX_NAME_WIDTH, maxLenPixels);
   maxLenPixels = Math.max(MIN_NAME_WIDTH, maxLenPixels);

   return `${maxLenPixels}px`;
}

/** Shared leading columns (division markers render as dots beside the name, not a column). */
export const competitorColumns = ['rank', 'name', 'boat', 'handicap'] as const;

/**
 * Show Club when at least two distinct non-empty club names appear
 * (typical of open events mixing host and visitor clubs).
 */
export function shouldShowClubColumn(clubs: Array<string | undefined | null>): boolean {
  const distinct = new Set<string>();
  for (const club of clubs) {
    const trimmed = club?.trim();
    if (trimmed) distinct.add(trimmed);
  }
  return distinct.size >= 2;
}

/** Insert `club` after `boat` when the column set should include it. */
export function withOptionalClubColumn(
  columns: readonly string[],
  clubs: Array<string | undefined | null>,
): string[] {
  const cols = [...columns];
  if (!shouldShowClubColumn(clubs)) {
    return cols.filter(c => c !== 'club');
  }
  if (cols.includes('club')) return cols;
  const boatIdx = cols.indexOf('boat');
  if (boatIdx === -1) {
    cols.push('club');
    return cols;
  }
  cols.splice(boatIdx + 1, 0, 'club');
  return cols;
}
