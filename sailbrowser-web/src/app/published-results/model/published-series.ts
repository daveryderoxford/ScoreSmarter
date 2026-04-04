import { ResultCode } from 'app/scoring/model/result-code';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';

export interface PublishedSeriesResult {
   seriesEntryId: string;
   rank: number;
   helm: string;
   crew?: string;
   boatClass: string;
   sailNumber: number;
   club: string;
   handicap: number;
   handicapScheme: HandicapScheme;
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
