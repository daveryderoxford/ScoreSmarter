/** Attendance for a duty-team member on a race day. */
export type DutyAttendanceStatus = 'not-attending' | 'attending' | 'confirmed';

export interface RaceDayDutyMember {
  /** Island Barn ack_key (needed to confirm attendance). */
  key: string;
  name: string;
  role: string;
  status: DutyAttendanceStatus;
}

/** Club-scoped race-day document at clubs/{clubId}/race-days/{yyyy-mm-dd}. */
export interface RaceDay {
  date: string;
  dutyTeam: RaceDayDutyMember[];
}
