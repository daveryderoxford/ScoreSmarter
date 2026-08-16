import type { DutyMember } from "@shared/duty-member";
import type { DutyAttendanceStatus, RaceDay, RaceDayDutyMember } from "@shared/race-day";

export const IBRSC_CLUB_ID = "ibrsc";

export const DUTY_ATTENDANCE_STATUSES: readonly DutyAttendanceStatus[] = [
  "not-attending",
  "attending",
  "confirmed",
];

const DATE_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDutyAttendanceStatus(value: unknown): value is DutyAttendanceStatus {
  return typeof value === "string"
    && (DUTY_ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/** Calendar date id (yyyy-mm-dd) in Europe/London when `date` is omitted. */
export function raceDayDateId(date?: string, now: Date = new Date()): string {
  if (date !== undefined) {
    if (!DATE_ID_PATTERN.test(date)) {
      throw new Error("invalid_date");
    }
    return date;
  }
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function raceDayDocPath(clubId: string, date: string): string {
  return `clubs/${clubId}/race-days/${date}`;
}

export function mapDutyMembersToRaceDayTeam(
  duties: readonly DutyMember[] | null,
): RaceDayDutyMember[] {
  if (!duties) return [];
  return duties.map((member) => ({
    key: member.key,
    name: member.name,
    role: member.role,
    status: member.attending ? "attending" : "not-attending",
  }));
}

export function applyDutyStatus(
  team: readonly RaceDayDutyMember[],
  key: string,
  status: DutyAttendanceStatus,
): RaceDayDutyMember[] {
  const idx = team.findIndex((member) => member.key === key);
  if (idx < 0) {
    throw new Error("member_not_found");
  }
  const next = [...team];
  next[idx] = { ...next[idx], status };
  return next;
}

/** Keys whose status newly became `confirmed` (for Island Barn sync). */
export function newlyConfirmedKeys(
  before: readonly RaceDayDutyMember[],
  after: readonly RaceDayDutyMember[],
): string[] {
  const beforeByKey = new Map(before.map((member) => [member.key, member]));
  const keys: string[] = [];
  for (const member of after) {
    if (member.status !== "confirmed") continue;
    const previous = beforeByKey.get(member.key);
    if (!previous || previous.status === "confirmed") continue;
    keys.push(member.key);
  }
  return keys;
}

export function shouldConfirmWithIslandBarn(clubId: string): boolean {
  return clubId === IBRSC_CLUB_ID;
}

export interface RaceDayStore {
  get(path: string): Promise<RaceDay | undefined>;
  set(path: string, data: RaceDay): Promise<void>;
}

export async function ensureRaceDayDocument(params: {
  store: RaceDayStore;
  clubId: string;
  dateId: string;
  fetchIslandBarnTeam: () => Promise<DutyMember[] | null>;
}): Promise<{ date: string; created: boolean }> {
  const path = raceDayDocPath(params.clubId, params.dateId);
  const existing = await params.store.get(path);
  if (existing) {
    return { date: params.dateId, created: false };
  }

  const duties = params.clubId === IBRSC_CLUB_ID
    ? await params.fetchIslandBarnTeam()
    : [];
  const raceDay: RaceDay = {
    date: params.dateId,
    dutyTeam: mapDutyMembersToRaceDayTeam(duties),
  };
  await params.store.set(path, raceDay);
  return { date: params.dateId, created: true };
}
