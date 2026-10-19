import test from "node:test";
import * as assert from "node:assert/strict";
import { migratedRaceFields } from "./race-lifecycle-migration.js";

test("migratedRaceFields maps legacy statuses onto the new lifecycle", () => {
  assert.deepEqual(migratedRaceFields({ status: "Published" }, true), {
    status: "Completed",
    resultsState: "provisional",
  });
  assert.deepEqual(migratedRaceFields({ status: "Verified" }, true), {
    status: "Completed",
    resultsState: "final",
  });
  assert.deepEqual(migratedRaceFields({ status: "Postponed" }, false), {
    status: "Future",
    resultsState: "provisional",
  });
});

test("migratedRaceFields completes archived races with results and cancels the rest", () => {
  assert.equal(migratedRaceFields({ status: "Archived" }, true)?.status, "Completed");
  assert.equal(migratedRaceFields({ status: "Archived" }, false)?.status, "Canceled");
});

test("migratedRaceFields adds a results state to current races and is idempotent", () => {
  assert.deepEqual(migratedRaceFields({ status: "Completed" }, true), {
    status: "Completed",
    resultsState: "provisional",
  });
  assert.equal(migratedRaceFields({ status: "Completed", resultsState: "final" }, true), null);
  assert.equal(migratedRaceFields({ status: "Future", resultsState: "provisional" }, false), null);
});
