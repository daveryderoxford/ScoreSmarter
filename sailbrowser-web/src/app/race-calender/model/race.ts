import { RaceStatus } from './race-status';
import { RaceType } from './race-type';
import { RaceStart } from './race-start';

export interface Race {
  id: string;
  seriesName: string;
  fleetId: string;
  index: number;
  seriesId: string;
  scheduledStart: Date;
  raceOfDay: number;
  
  starts?: RaceStart[];

  /**
   * The actual start time of the race.
   * 
   * NOTE: When timeInputMode is 'elapsed' (Stopwatch), this represents a nominal start time
   * on the day of the race (usually 00:00:00) plus the stopwatch reading at the start.
   * This allows elapsed times to be calculated by subtracting this value from the finish time
   * (which is also stored as a Date on the same day).
   */
  actualStart?: Date;
  timeInputMode?: 'tod' | 'elapsed';
  type: RaceType;
  status: RaceStatus;
  isDiscardable: boolean;
  isAverageLap: boolean;
  dirty: boolean;
}