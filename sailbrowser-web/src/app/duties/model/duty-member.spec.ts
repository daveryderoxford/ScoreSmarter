import { describe, expect, it } from 'vitest';
import { dutyRaceOfficer, type RaceDayDutyMember } from './duty-member';

function member(name: string, role: string, status: RaceDayDutyMember['status'] = 'attending'): RaceDayDutyMember {
  return { key: name, name, role, status };
}

describe('dutyRaceOfficer', () => {
  it('finds the race officer and ignores assistants', () => {
    const team = [
      member('Sam', 'catering'),
      member('Alex', 'assistant race officer'),
      member('Robin', 'duty race officer'),
    ];
    expect(dutyRaceOfficer(team)).toBe('Robin');
  });

  it('prefers a race officer who has not said they are not attending', () => {
    const team = [
      member('Robin', 'duty race officer', 'not-attending'),
      member('Jo', 'duty race officer', 'confirmed'),
    ];
    expect(dutyRaceOfficer(team)).toBe('Jo');
  });

  it('falls back to the rostered race officer', () => {
    expect(dutyRaceOfficer([member('Robin', 'duty race officer', 'not-attending')])).toBe('Robin');
  });

  it('returns nothing without a race officer', () => {
    expect(dutyRaceOfficer([member('Sam', 'catering')])).toBeUndefined();
  });
});
