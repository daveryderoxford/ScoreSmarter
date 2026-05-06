import type { Race as CalendarRace } from 'app/race-calender/model/race';

/** Portable race subset consumed by scoring. */
export type Race = Pick<
  CalendarRace,
  'id' | 'index' | 'scheduledStart' | 'actualStart' | 'type' | 'isDiscardable' | 'isAverageLap'
>;
