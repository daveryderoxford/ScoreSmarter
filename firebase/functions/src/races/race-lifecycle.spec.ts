import test from "node:test";
import * as assert from "node:assert/strict";
import { NOT_FINISHED, raceLifecycleUpdate, raceStatusFromCounts, racesToRecompute } from "./race-lifecycle.js";

test("raceStatusFromCounts maps entry counts to Future / In progress / Completed", () => {
  assert.equal(raceStatusFromCounts(0, 0), "Future");
  assert.equal(raceStatusFromCounts(2, 2), "Future");
  assert.equal(raceStatusFromCounts(2, 1), "In progress");
  assert.equal(raceStatusFromCounts(3, 0), "Completed");
});

test("raceLifecycleUpdate only writes when something changes", () => {
  assert.deepEqual(raceLifecycleUpdate({ status: "Future" }, "In progress"), { status: "In progress" });
  assert.deepEqual(raceLifecycleUpdate({ status: "In progress" }, "Completed"), { status: "Completed" });
  assert.equal(raceLifecycleUpdate({ status: "Completed", resultsState: "provisional" }, "Completed"), null);
  assert.equal(raceLifecycleUpdate({ status: "Completed" }), null);
});

test("raceLifecycleUpdate moves a completed race back when a late entry arrives", () => {
  assert.deepEqual(raceLifecycleUpdate({ status: "Completed" }, "In progress"), { status: "In progress" });
});

test("raceLifecycleUpdate returns final results to provisional on any results change", () => {
  assert.deepEqual(raceLifecycleUpdate({ status: "Completed", resultsState: "final" }), {
    resultsState: "provisional",
  });
  assert.deepEqual(raceLifecycleUpdate({ status: "Completed", resultsState: "final" }, "In progress"), {
    status: "In progress",
    resultsState: "provisional",
  });
});

test("raceLifecycleUpdate leaves cancelled races alone", () => {
  assert.equal(raceLifecycleUpdate({ status: "Canceled" }, "Completed"), null);
  assert.equal(raceLifecycleUpdate({ status: "Canceled", resultsState: "final" }), null);
});

test("racesToRecompute skips the status counts when the result code is unchanged", () => {
  assert.deepEqual(
    racesToRecompute({ raceId: "r1", resultCode: "OK" }, { raceId: "r1", resultCode: "OK" }),
    [{ raceId: "r1", recomputeStatus: false }],
  );
  assert.deepEqual(
    racesToRecompute({ raceId: "r1", resultCode: NOT_FINISHED }, { raceId: "r1", resultCode: "OK" }),
    [{ raceId: "r1", recomputeStatus: true }],
  );
});

test("racesToRecompute treats a missing result code as not finished", () => {
  assert.deepEqual(
    racesToRecompute({ raceId: "r1" }, { raceId: "r1", resultCode: NOT_FINISHED }),
    [{ raceId: "r1", recomputeStatus: false }],
  );
});

test("racesToRecompute recomputes on create, delete and a move between races", () => {
  assert.deepEqual(racesToRecompute(undefined, { raceId: "r1", resultCode: NOT_FINISHED }), [
    { raceId: "r1", recomputeStatus: true },
  ]);
  assert.deepEqual(racesToRecompute({ raceId: "r1", resultCode: "OK" }, undefined), [
    { raceId: "r1", recomputeStatus: true },
  ]);
  assert.deepEqual(racesToRecompute({ raceId: "r1" }, { raceId: "r2" }), [
    { raceId: "r1", recomputeStatus: true },
    { raceId: "r2", recomputeStatus: true },
  ]);
  assert.deepEqual(racesToRecompute(undefined, undefined), []);
});
