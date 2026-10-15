import type { RaceDayDutyMember } from '@shared/race-day';

export type { DutyMember } from '@shared/duty-member';
export type { DutyAttendanceStatus, RaceDay, RaceDayDutyMember } from '@shared/race-day';

/** The duty race officer's name, preferring one who has not said they are not attending. Assistants are ignored. */
export function dutyRaceOfficer(team: readonly RaceDayDutyMember[]): string | undefined {
  const officers = team.filter(m => /race officer/i.test(m.role) && !/assistant/i.test(m.role));
  return (officers.find(m => m.status !== 'not-attending') ?? officers[0])?.name;
}
