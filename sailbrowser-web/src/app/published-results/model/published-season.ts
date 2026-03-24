export interface SeriesInfo {
   id: string;
   baseSeriesId?: string;
   name: string;
   fleetId: string;
   startDate: Date;
   endDate: Date;
   raceCount: number;
}

export interface PublishedSeason {
   id: string;
   name: string;
   series: SeriesInfo[];
}
