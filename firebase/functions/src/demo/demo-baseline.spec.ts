import test from "node:test";
import * as assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { decodeValue, encodeValue, planRestore } from "./demo-baseline.js";

test("encodeValue/decodeValue round-trip timestamps inside nested data", () => {
  const start = Timestamp.fromMillis(1_780_000_000_000);
  const data = { scheduledStart: start, results: [{ finish: start, helm: "Alex" }], laps: 2, notes: null };

  const json = JSON.parse(JSON.stringify(encodeValue(data)));
  assert.deepEqual(json.scheduledStart, { __ts: 1_780_000_000_000 });

  const decoded = decodeValue(json) as typeof data;
  assert.ok(decoded.scheduledStart instanceof Timestamp);
  assert.equal(decoded.scheduledStart.toMillis(), start.toMillis());
  assert.equal((decoded.results[0].finish as Timestamp).toMillis(), start.toMillis());
  assert.equal(decoded.notes, null);
});

test("planRestore rewrites only missing or changed docs and deletes extras", () => {
  const existing = new Map([
    ["boats/a", 100], // unchanged since reset
    ["boats/b", 300], // edited by a trainee after the reset
    ["boats/new", 300], // created by a trainee
  ]);

  const plan = planRestore(["boats/a", "boats/b", "boats/c"], existing, 200);

  assert.deepEqual(plan.writes.sort(), ["boats/b", "boats/c"]);
  assert.deepEqual(plan.deletes, ["boats/new"]);
});

test("planRestore rewrites every baseline doc when there was no previous reset", () => {
  const plan = planRestore(["boats/a", "boats/b"], new Map([["boats/a", 1]]), undefined);
  assert.deepEqual(plan.writes.sort(), ["boats/a", "boats/b"]);
  assert.deepEqual(plan.deletes, []);
});
