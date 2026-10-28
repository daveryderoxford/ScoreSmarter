import test from "node:test";
import * as assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { checkWelcomeCode, hashWelcomeCode, newWelcomeCode } from "./welcome-code.js";

const now = new Date("2026-11-01T12:00:00Z");
const tomorrow = Timestamp.fromDate(new Date("2026-11-02T12:00:00Z"));
const yesterday = Timestamp.fromDate(new Date("2026-10-31T12:00:00Z"));

test("newWelcomeCode returns a URL-safe code and its hash", () => {
  const { code, codeHash } = newWelcomeCode();
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(codeHash, hashWelcomeCode(code));
  assert.notEqual(newWelcomeCode().code, code);
});

test("checkWelcomeCode accepts the matching, unexpired, unclaimed code", () => {
  const { code, codeHash } = newWelcomeCode();
  assert.equal(checkWelcomeCode({ codeHash, codeExpiresAt: tomorrow }, code, now), "ok");
});

test("checkWelcomeCode rejects wrong, missing or expired codes", () => {
  const { code, codeHash } = newWelcomeCode();
  assert.equal(checkWelcomeCode({ codeHash, codeExpiresAt: tomorrow }, "wrong", now), "invalid");
  assert.equal(checkWelcomeCode({ codeHash, codeExpiresAt: tomorrow }, "", now), "invalid");
  assert.equal(checkWelcomeCode({ codeExpiresAt: tomorrow }, code, now), "invalid");
  assert.equal(checkWelcomeCode(undefined, code, now), "invalid");
  assert.equal(checkWelcomeCode({ codeHash, codeExpiresAt: yesterday }, code, now), "expired");
});

test("checkWelcomeCode reports a club that has already been claimed", () => {
  const { code, codeHash } = newWelcomeCode();
  assert.equal(checkWelcomeCode({ codeHash, codeExpiresAt: tomorrow, claimedBy: "uid-1" }, code, now), "claimed");
});
