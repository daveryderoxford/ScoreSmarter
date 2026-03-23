import { ResultCode } from 'app/scoring/model/result-code';

export interface PublishedSeriesResult {
   seriesEntryId: string;
   rank: number;
   helm: string;
   crew?: string;
   boatClass: string;
   sailNumber: number;
   club: string;
   handicap: number;
   totalPoints: number;
   netPoints: number;
   raceScores: {
      raceIndex: number;
      points: number;
      resultCode: ResultCode;
      isDiscard: boolean;
      notes?: string;
   }[];
   scoresForTiebreak: number[];
}

export interface PublishedSeries {
   id: string;
   name: string;
   fleetId: string;
   competitors: PublishedSeriesResult[];
}
