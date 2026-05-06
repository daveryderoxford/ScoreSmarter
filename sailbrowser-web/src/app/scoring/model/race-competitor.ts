import type { RaceCompetitor as AppRaceCompetitor } from 'app/results-input/model/race-competitor';

/** Portable scoring view of race competitor rows. */
export type RaceCompetitor = Pick<
  AppRaceCompetitor,
  | 'id'
  | 'seriesEntryId'
  | 'raceId'
  | 'seriesId'
  | 'resultCode'
  | 'startTime'
  | 'recordedFinishTime'
  | 'manualFinishTime'
  | 'manualPosition'
  | 'manualLaps'
  | 'lapTimes'
  | 'crewOverride'
>;
