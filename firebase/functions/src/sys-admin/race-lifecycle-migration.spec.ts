import test from "node:test";
import * as assert from "node:assert/strict";
import { migratedRaceFields } from "./race-lifecycle-migration.js";

const allFinished = { entries: 3, notFinished: 0 };
const partlyFinished = { entries: 3, notFinished: 1 };
const noResults = { entries: 0, notFinished: 0 };

test("migratedRaceFields marks every completed race final", () => {
  for (const status of ["Completed", "Published", "Verified"] as const) {
    assert.deepEqual(migratedRaceFields({ status }, allFinished), { status: "Completed", resultsState: "final" });
  }
  assert.deepEqual(migratedRaceFields({ status: "Archived" }, allFinished), {
    status: "Completed",
    resultsState: "final",
  });
});

test("migratedRaceFields keeps a completed race with no result documents completed", () => {
  assert.deepEqual(migratedRaceFields({ status: "Completed" }, noResults), {
    status: "Completed",
    resultsState: "final",
  });
});

test("migratedRaceFields fixes stale statuses from the race's results, leaving them provisional", () => {
  assert.deepEqual(migratedRaceFields({ status: "In progress" }, allFinished), {
    status: "Completed",
    resultsState: "provisional",
  });
  assert.deepEqual(migratedRaceFields({ status: "Future" }, partlyFinished), {
    status: "In progress",
    resultsState: "provisional",
  });
  assert.deepEqual(migratedRaceFields({ status: "Completed" }, partlyFinished), {
    status: "In progress",
    resultsState: "provisional",
  });
});

test("migratedRaceFields leaves other races provisional", () => {
  assert.deepEqual(migratedRaceFields({ status: "In progress" }, partlyFinished), {
    status: "In progress",
    resultsState: "provisional",
  });
  assert.deepEqual(migratedRaceFields({ status: "Postponed" }, noResults), {
    status: "Future",
    resultsState: "provisional",
  });
  assert.deepEqual(migratedRaceFields({ status: "Archived" }, noResults), {
    status: "Canceled",
    resultsState: "provisional",
  });
});

test("migratedRaceFields never changes a cancelled race's status", () => {
  assert.deepEqual(migratedRaceFields({ status: "Canceled" }, allFinished), {
    status: "Canceled",
    resultsState: "provisional",
  });
});

test("migratedRaceFields never overwrites an existing results state and is idempotent", () => {
  assert.equal(migratedRaceFields({ status: "Completed", resultsState: "final" }, allFinished), null);
  assert.equal(migratedRaceFields({ status: "Completed", resultsState: "provisional" }, allFinished), null);
  assert.equal(migratedRaceFields({ status: "Future", resultsState: "provisional" }, noResults), null);
});
