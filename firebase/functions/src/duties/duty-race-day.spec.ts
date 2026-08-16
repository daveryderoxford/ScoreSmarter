import test from "node:test";
import * as assert from "node:assert/strict";
import type { DutyMember } from "@shared/duty-member";
import type { RaceDay } from "@shared/race-day";
import {
  applyDutyStatus,
  ensureRaceDayDocument,
  IBRSC_CLUB_ID,
  mapDutyMembersToRaceDayTeam,
  newlyConfirmedKeys,
  raceDayDateId,
  raceDayDocPath,
  shouldConfirmWithIslandBarn,
  type RaceDayStore,
} from "./duty-race-day.js";

const ibTeam: DutyMember[] = [
  {
    role: "duty race officer",
    name: "David RYDER",
    attending: false,
    key: "ack-1",
  },
  {
    role: "catering",
    name: "Sam Helm",
    attending: true,
    key: "ack-2",
  },
];

function memoryStore(initial?: Record<string, RaceDay>): RaceDayStore & { docs: Record<string, RaceDay> } {
  const docs: Record<string, RaceDay> = { ...(initial ?? {}) };
  return {
    docs,
    async get(path) {
      return docs[path];
    },
    async set(path, data) {
      docs[path] = data;
    },
  };
}

test("raceDayDateId accepts yyyy-mm-dd and rejects invalid", () => {
  assert.equal(raceDayDateId("2026-08-14"), "2026-08-14");
  assert.throws(() => raceDayDateId("2026-8-14"), /invalid_date/);
  assert.equal(
    raceDayDateId(undefined, new Date("2026-08-14T12:00:00.000Z")),
    new Date("2026-08-14T12:00:00.000Z").toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
  );
});

test("mapDutyMembersToRaceDayTeam maps attending flags", () => {
  assert.deepEqual(mapDutyMembersToRaceDayTeam(ibTeam), [
    { key: "ack-1", name: "David RYDER", role: "duty race officer", status: "not-attending" },
    { key: "ack-2", name: "Sam Helm", role: "catering", status: "attending" },
  ]);
  assert.deepEqual(mapDutyMembersToRaceDayTeam(null), []);
});

test("applyDutyStatus updates the matching member", () => {
  const team = mapDutyMembersToRaceDayTeam(ibTeam);
  const next = applyDutyStatus(team, "ack-1", "confirmed");
  assert.equal(next[0]?.status, "confirmed");
  assert.equal(next[1]?.status, "attending");
  assert.throws(() => applyDutyStatus(team, "missing", "attending"), /member_not_found/);
});

test("shouldConfirmWithIslandBarn only for ibrsc", () => {
  assert.equal(shouldConfirmWithIslandBarn(IBRSC_CLUB_ID), true);
  assert.equal(shouldConfirmWithIslandBarn("other"), false);
});

test("newlyConfirmedKeys returns keys newly set to confirmed", () => {
  const team = mapDutyMembersToRaceDayTeam(ibTeam);
  assert.deepEqual(
    newlyConfirmedKeys(team, applyDutyStatus(team, "ack-1", "attending")),
    [],
  );
  assert.deepEqual(
    newlyConfirmedKeys(team, applyDutyStatus(team, "ack-1", "confirmed")),
    ["ack-1"],
  );
  assert.deepEqual(
    newlyConfirmedKeys(
      applyDutyStatus(team, "ack-2", "attending"),
      applyDutyStatus(team, "ack-2", "confirmed"),
    ),
    ["ack-2"],
  );
  const confirmed = applyDutyStatus(team, "ack-1", "confirmed");
  assert.deepEqual(newlyConfirmedKeys(confirmed, confirmed), []);
});

test("ensureRaceDayDocument writes mapped team on first call and is a no-op next", async () => {
  const store = memoryStore();
  const fetches: number[] = [];
  const first = await ensureRaceDayDocument({
    store,
    clubId: IBRSC_CLUB_ID,
    dateId: "2026-08-14",
    fetchIslandBarnTeam: async () => {
      fetches.push(1);
      return ibTeam;
    },
  });
  assert.deepEqual(first, { date: "2026-08-14", created: true });
  const path = raceDayDocPath(IBRSC_CLUB_ID, "2026-08-14");
  assert.equal(store.docs[path]?.dutyTeam.length, 2);
  assert.equal(store.docs[path]?.dutyTeam[0]?.status, "not-attending");

  const second = await ensureRaceDayDocument({
    store,
    clubId: IBRSC_CLUB_ID,
    dateId: "2026-08-14",
    fetchIslandBarnTeam: async () => {
      fetches.push(1);
      return ibTeam;
    },
  });
  assert.deepEqual(second, { date: "2026-08-14", created: false });
  assert.equal(fetches.length, 1);
});

test("ensureRaceDayDocument writes an empty team when Island Barn has no duty day", async () => {
  const store = memoryStore();
  await ensureRaceDayDocument({
    store,
    clubId: IBRSC_CLUB_ID,
    dateId: "2026-08-14",
    fetchIslandBarnTeam: async () => null,
  });
  assert.deepEqual(store.docs[raceDayDocPath(IBRSC_CLUB_ID, "2026-08-14")], {
    date: "2026-08-14",
    dutyTeam: [],
  });
});
