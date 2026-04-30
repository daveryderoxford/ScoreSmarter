import test from "node:test";
import * as assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

test("validateStoredRequest accepts required fields", async () => {
  const { validateStoredRequest } = await import("./callable-parse-results-sheet.js");
  const data = validateStoredRequest(
    {
      scannerContext: { targetRaces: [], lapFormat: "numbers", hasHours: false, listOrder: "unsorted", roster: [] },
      clubId: "club-1",
      raceId: "race-1",
    },
    "req-1",
  );

  assert.equal(data.clubId, "club-1");
  assert.equal(data.raceId, "race-1");
});

test("validateStoredRequest throws when raceId is missing", async () => {
  const { validateStoredRequest } = await import("./callable-parse-results-sheet.js");
  assert.throws(
    () => validateStoredRequest(
      {
        scannerContext: { targetRaces: [], lapFormat: "numbers", hasHours: false, listOrder: "unsorted", roster: [] },
        clubId: "club-1",
      },
      "req-2",
    ),
    /Missing raceId/,
  );
});
