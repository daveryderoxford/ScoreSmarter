import test from "node:test";
import assert from "node:assert/strict";
import { raceCalendarDocPath, resultsSheetStoragePath } from "./image-storage";

test("resultsSheetStoragePath uses canonical overwrite-safe location", () => {
  assert.equal(
    resultsSheetStoragePath("club-123", "race-77"),
    "clubs/club-123/results-sheets/sheet-race-77",
  );
});

test("raceCalendarDocPath points to calendar race document", () => {
  assert.equal(
    raceCalendarDocPath("club-123", "race-77"),
    "clubs/club-123/calendar/race-77",
  );
});
