import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest } from "./callable-parse-results-sheet";

test("validateRequest defaults imageMimeType to image/jpeg", () => {
  const data = validateRequest(
    {
      imageBase64: "ZmFrZS1pbWFnZQ==",
      scannerContext: { targetRaces: [], lapFormat: "numbers", hasHours: false, listOrder: "unsorted", roster: [] },
      clubId: "club-1",
      raceId: "race-1",
    },
    "req-1",
  );

  assert.equal(data.imageMimeType, "image/jpeg");
  assert.equal(data.clubId, "club-1");
  assert.equal(data.raceId, "race-1");
});

test("validateRequest throws when raceId is missing", () => {
  assert.throws(
    () => validateRequest(
      {
        imageBase64: "ZmFrZS1pbWFnZQ==",
        scannerContext: { targetRaces: [], lapFormat: "numbers", hasHours: false, listOrder: "unsorted", roster: [] },
        clubId: "club-1",
      },
      "req-2",
    ),
    /Missing raceId/,
  );
});
