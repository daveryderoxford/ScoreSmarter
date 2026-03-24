export interface SeriesEntry {
   id: string;
   seriesId: string;

   // Core Identity
   helm: string;
   crew?: string;
   club?: string;

   // Default Boat Details
   boatClass: string;
   sailNumber: number;
   handicap: number;
   fleetId?: string;

   // For subset scoring
   tags?: string[];
}
