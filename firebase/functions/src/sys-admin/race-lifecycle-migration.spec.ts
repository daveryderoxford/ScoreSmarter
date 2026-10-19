import test from "node:test";
import * as assert from "node:assert/strict";
import { migratedRaceFields } from "./race-lifecycle-migration.js";

test("migratedRaceFields marks every completed race final", () => {
  for (const status of ["Completed", "Published", "Verified"] as const) {
    assert.deepEqual(migratedRaceFields({ status }, true), { status: "Completed", resultsState: "final" });
  }
  assert.deepEqual(migratedRaceFields({ status: "Archived" }, true), { status: "Completed", resultsState: "final" });
});

test("migratedRaceFields leaves other races provisional", () => {
  assert.deepEqual(migratedRaceFields({ status: "In progress" }, true), {
    status: "In progress",
    resultsState: "provisional",
  });
  assert.deepEqual(migratedRaceFields({ status: "Postponed" }, false), {
    status: "Future",
    resultsState: "provisional",
  });
  assert.deepEqual(migratedRaceFields({ status: "Archived" }, false), {
    status: "Canceled",
    resultsState: "provisional",
  });
});

test("migratedRaceFields never overwrites an existing results state and is idempotent", () => {
  assert.equal(migratedRaceFields({ status: "Completed", resultsState: "final" }, true), null);
  assert.equal(migratedRaceFields({ status: "Completed", resultsState: "provisional" }, true), null);
  assert.equal(migratedRaceFields({ status: "Future", resultsState: "provisional" }, false), null);
});
