export interface RaceStart {
  id: string;
  /** Start timestamp on race day (or stopwatch timestamp for elapsed mode). */
  timeOfDay: Date;
  /**
   * Competitors who use this start. Set at most one of `fleetId` and `divisionId`.
   * Neither means the default start for competitors who match no named start.
   * When a competitor matches more than one named start, the first in list order wins.
   */
  fleetId?: string;
  divisionId?: string;
}
