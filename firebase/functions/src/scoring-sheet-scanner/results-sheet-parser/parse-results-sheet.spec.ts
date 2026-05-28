import test from "node:test";
import * as assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

test("validateStoredRequest accepts required fields", async () => {
  const { validateStoredRequest } = await import("./parse-results-sheet.js");
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
  const { validateStoredRequest } = await import("./parse-results-sheet.js");
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

test("extractScanResponseForPersistence keeps scan fields only", async () => {
  const { extractScanResponseForPersistence } = await import("./parse-results-sheet.js");
  const payload = extractScanResponseForPersistence({
    scannedResults: [{ rowIndex: 1 }],
    pageNotes: "note",
    unreadableRowsCount: 2,
    storedImagePath: "clubs/x/img.jpg",
    storedImageUri: "gs://bucket/x",
  });
  assert.deepEqual(payload, {
    scannedResults: [{ rowIndex: 1 }],
    pageNotes: "note",
    unreadableRowsCount: 2,
  });
});
