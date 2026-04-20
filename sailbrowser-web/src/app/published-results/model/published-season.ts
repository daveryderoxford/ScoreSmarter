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
}

export interface PublishedSeason {
   id: string;
   name: string;
   series: SeriesInfo[];
}
