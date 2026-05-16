
/** Shared functionality between series and results tables */

export interface HelmCrew  {
   helm: string;
   crew?: string;
}

const MAX_NAME_WIDTH = 200;
const MIN_NAME_WIDTH = 80;

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

   // Estimate width: (char count * avg char width) + padding.
   let maxLenPixels = maxLenChars * 8 + 15;
   maxLenPixels = Math.min(MAX_NAME_WIDTH, maxLenPixels);
   maxLenPixels = Math.max(MIN_NAME_WIDTH, maxLenPixels);

   return `${maxLenPixels}px`;
}

/** Shared leading columns (tags render as dots beside the name, not a column). */
export const competitorColumns = ['rank', 'name', 'boat', 'handicap'] as const;