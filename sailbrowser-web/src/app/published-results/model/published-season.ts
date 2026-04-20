export interface SeriesInfo {
   id: string;
   baseSeriesId?: string;
   name: string;
   fleetId: string;
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
