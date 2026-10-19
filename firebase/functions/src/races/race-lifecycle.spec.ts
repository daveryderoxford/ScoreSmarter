import test from "node:test";
import * as assert from "node:assert/strict";
import { NOT_FINISHED, raceLifecycleUpdate, raceStatusFromResultCodes } from "./race-lifecycle.js";

test("raceStatusFromResultCodes maps result codes to Future / In progress / Completed", () => {
  assert.equal(raceStatusFromResultCodes([]), "Future");
  assert.equal(raceStatusFromResultCodes([NOT_FINISHED, NOT_FINISHED]), "Future");
  assert.equal(raceStatusFromResultCodes(["OK", NOT_FINISHED]), "In progress");
  assert.equal(raceStatusFromResultCodes(["OK", "DNF", "OOD"]), "Completed");
});

test("raceLifecycleUpdate only writes when something changes", () => {
  assert.deepEqual(raceLifecycleUpdate({ status: "Future" }, ["OK", NOT_FINISHED]), { status: "In progress" });
  assert.deepEqual(raceLifecycleUpdate({ status: "In progress" }, ["OK", "DNF"]), { status: "Completed" });
  assert.equal(raceLifecycleUpdate({ status: "Completed", resultsState: "provisional" }, ["OK"]), null);
});

test("raceLifecycleUpdate moves a completed race back when a late entry arrives", () => {
  assert.deepEqual(raceLifecycleUpdate({ status: "Completed" }, ["OK", NOT_FINISHED]), { status: "In progress" });
});

test("raceLifecycleUpdate returns final results to provisional on any results change", () => {
  assert.deepEqual(raceLifecycleUpdate({ status: "Completed", resultsState: "final" }, ["OK"]), {
    resultsState: "provisional",
  });
  assert.deepEqual(raceLifecycleUpdate({ status: "Completed", resultsState: "final" }, ["OK", NOT_FINISHED]), {
    status: "In progress",
    resultsState: "provisional",
  });
});

test("raceLifecycleUpdate leaves cancelled races alone", () => {
  assert.equal(raceLifecycleUpdate({ status: "Canceled" }, ["OK"]), null);
});
