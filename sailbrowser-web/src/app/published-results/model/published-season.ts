import type { HandicapScheme } from 'app/scoring/model/handicap-scheme';

export interface SeriesInfo {
   id: string;
   /** Calendar series id. Equal to `id` for the primary published series; secondary scoring and division series differ. */
   baseSeriesId?: string;
   name: string;
   fleetId: string;
   /** Scheme of the scoring configuration it was published with. Absent on series published before this field was added. */
   handicapScheme?: HandicapScheme;
   startDate: Date;
   endDate: Date;
   raceCount: number;
   /** Rolling count of races in the last 6 days for this published series. */
   recentRaceCount6d?: number;
   /** Scheduled start of the last published race in this series. */
   lastPublishedRaceStart?: Date;
}

export interface PublishedSeason {
   id: string;
   name: string;
   series: SeriesInfo[];
}
