import test from "node:test";
import * as assert from "node:assert/strict";
import {
  buildAttendanceUrl,
  buildTeamForDayUrl,
  parseDutyTeamResponse,
} from "./island-barn-duty-api.js";

test("parseDutyTeamResponse returns null for non-duty day", () => {
  assert.equal(parseDutyTeamResponse(null), null);
});

test("parseDutyTeamResponse maps duty members", () => {
  const duties = parseDutyTeamResponse([
    {
      role: "duty race officer",
      name: "David RYDER",
      attending: false,
      ack_key: "89744d04299c8b1c4b58d786776d80",
    },
  ]);
  assert.deepEqual(duties, [
    {
      role: "duty race officer",
      name: "David RYDER",
      attending: false,
      key: "89744d04299c8b1c4b58d786776d80",
    },
  ]);
});

test("parseDutyTeamResponse skips invalid rows", () => {
  const duties = parseDutyTeamResponse([
    { role: "catering", name: "Sam", key: "abc" },
    { role: "missing ack" },
  ]);
  assert.deepEqual(duties, [
    { role: "catering", name: "Sam", attending: false, key: "abc" },
  ]);
});

test("buildTeamForDayUrl includes api key and optional date", () => {
  const url = buildTeamForDayUrl("secret-key", "2026-6-21");
  assert.match(url, /team_for_day\.json\?/);
  assert.match(url, /api_key=secret-key/);
  assert.match(url, /date=2026-6-21/);
});

test("buildAttendanceUrl posts attending flag", () => {
  const present = buildAttendanceUrl("secret-key", "ack-1", true);
  const absent = buildAttendanceUrl("secret-key", "ack-1", false);
  assert.match(present, /attendance_for_day\.json\?/);
  assert.match(present, /attending=1/);
  assert.match(absent, /attending=0/);
  assert.match(present, /ack_key=ack-1/);
});
