export interface RaceStart {
  id: string;
  /** Start timestamp on race day (or stopwatch timestamp for elapsed mode). */
  timeOfDay: Date;
  /** Optional fleet target. Undefined means default/no-fleet fallback start. */
  fleetId?: string;
}
