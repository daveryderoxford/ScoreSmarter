import test from "node:test";
import * as assert from "node:assert/strict";
import {
  kioskClaims,
  kioskDocPath,
  kioskUid,
  sanitizeDeviceId,
  validateClubId,
  validateDeviceId,
} from "./kiosk-auth.js";

test("validateDeviceId accepts typical Fully-style IDs", () => {
  assert.equal(validateDeviceId("abc-123_DEF:99"), "abc-123_DEF:99");
  assert.equal(validateDeviceId("  pad  "), "pad");
});

test("validateDeviceId rejects empty or invalid", () => {
  assert.throws(() => validateDeviceId(""), /missing_device_id/);
  assert.throws(() => validateDeviceId("bad id!"), /device_id_invalid_chars/);
  assert.throws(() => validateDeviceId("x".repeat(200)), /device_id_too_long/);
});

test("validateClubId accepts subdomain-style ids", () => {
  assert.equal(validateClubId("islandbarn"), "islandbarn");
  assert.equal(validateClubId("test"), "test");
});

test("validateClubId rejects invalid", () => {
  assert.throws(() => validateClubId(""), /missing_club_id/);
  assert.throws(() => validateClubId("bad club"), /club_id_invalid/);
});

test("kioskUid sanitizes and prefixes", () => {
  assert.equal(kioskUid("abc-123:def"), "kiosk_abc_123_def");
  assert.equal(sanitizeDeviceId("a.b:c"), "a_b_c");
});

test("kioskClaims grants race-officer for club", () => {
  assert.deepEqual(kioskClaims("test", "dev-1"), {
    clubs: { test: "race-officer" },
    kiosk: true,
    deviceId: "dev-1",
  });
});

test("kioskDocPath is club-scoped", () => {
  assert.equal(
    kioskDocPath("test", "device-1"),
    "clubs/test/authorized_kiosks/device-1",
  );
});
