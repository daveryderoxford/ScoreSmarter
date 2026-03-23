import { ResultCode } from 'app/scoring';
import { differenceInSeconds } from 'date-fns';

export const RESULTS_UNSET_VALUE = 9999;

export const RESULTS_TIME_ERROR = -9999;

export class RaceCompetitor {
  id: string;
  seriesEntryId: string; 
  raceId: string;
  seriesId: string;
  helm: string;
  crew?: string;
  boatClass: string;
  sailNumber: number;
  handicap: number;
  fleetId?: string;

  /**
   * Finish time recorded when competitor finishes.
   * If a manual finish time set by hand is specified it is used in preference.
   * The recorded finish time is null if it has not been recorded.
   */
  recordedFinishTime?: Date;

  /**
   * Manually specified finish time.
   * Used in preference to the recorded finish time if specified.
   * The manual finish time may be set to null to disable it.
   */
  manualFinishTime?: Date;

  /**
   * Start time for the competitor - set based on the race at start and finish
   */
  startTime?: Date;

  resultCode: ResultCode;

  /**
   * Number of laps - defaults to number of lap times but may be manually set
   */
  manualLaps: number;
  lapTimes: Date[];

  /**
   * Manually specified position for level rating or pursuit races
   */
  manualPosition?: number;

  constructor(data: Partial<RaceCompetitor>) {
    console.log("RaceCompetitor: Constructor called for " + data.id);
    this.id = data.id || '';
    this.seriesEntryId = data.seriesEntryId || ''; 
    this.raceId = data.raceId || '';
    this.seriesId = data.seriesId || '';
    this.helm = data.helm || '';
    this.crew = data.crew;
    this.boatClass = data.boatClass || '';
    this.sailNumber = data.sailNumber || 0;
    this.handicap = data.handicap || 0;
    this.fleetId = data.fleetId;
    this.recordedFinishTime = data.recordedFinishTime;
    this.manualFinishTime = data.manualFinishTime;
    this.startTime = data.startTime;
    this.resultCode = data.resultCode || 'NOT FINISHED';
    this.manualLaps = data.manualLaps || 0;
    this.lapTimes = data.lapTimes || [];
    this.manualPosition = data.manualPosition;
  }

  /**
   * Gets the finish time using a manually entered time in preference to
   * a recorded one. Returns undefined if no finish time is available.
   */
  get finishTime(): Date | undefined {
    return this.manualFinishTime ?? this.recordedFinishTime;
  }

  /** 
   * Returns the elapsed time in seconds, 
   * or undefined if it cannot be calculated.
  */
  get elapsedTime(): number | undefined {
    console.log("RaceCompetitor: Elapsed time getter called");

    // Competitor has not finished, or does not have a valid start/finish time.
    if (this.resultCode === 'NOT FINISHED' || !this.startTime || !this.finishTime) {
      return undefined;
    }

    const elapsed = differenceInSeconds(this.finishTime, this.startTime);

    if (elapsed < 0) {
      console.error("RaceCompetitor: Finish time is before Start time for competitor:", this.id);
      return RESULTS_TIME_ERROR;
    }

    return elapsed;
  }

  /**
   * The number of laps, manual value if set, otherwise the number of lap times recorded.
   */
  get numLaps(): number {
    if (this.manualLaps > 0) {
      return this.manualLaps;
    }
    // If competitor has finished then he has completed an extra lap.
    return this.finishTime ? this.lapTimes.length + 1 : this.lapTimes.length;
  }

  get helmCrew(): string {
    console.log("RaceCompetitor:  Hem/crew called");

    return this.crew && this.crew.trim().length > 0 ? `${this.helm} / ${this.crew}` : this.helm;
  }

  /**
   * Gets the average lap time in seconds.
   */
  get averageLapTime(): number | undefined {
    if (this.elapsedTime && this.numLaps > 0) {
      return this.elapsedTime / this.numLaps;
    }
    return undefined;
  }
}
