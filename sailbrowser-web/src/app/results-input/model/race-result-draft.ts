import type { ResultCode } from 'app/scoring/model/result-code';

/** Unsaved panel state merged with stored competitor when opening Full result data. */
export interface RaceResultDraft {
  startTime?: Date | null;
  finishTime?: Date | null;
  laps?: number;
  resultCode?: ResultCode;
  manualPosition?: number | null;
  crewOverride?: string;
}
