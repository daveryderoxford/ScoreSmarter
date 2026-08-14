import test from "node:test";
import * as assert from "node:assert/strict";
import { buildLevelRatingPrompt, buildPrompt } from "./prompt-builder.js";
import type { ScannerContext } from "../ai-scan-model.js";

const baseContext: ScannerContext = {
  races: [{
    id: "race-1",
    entries: [{ id: "comp-1", class: "ILCA 7", sailNumber: "12345", name: "Sam" }],
  }],
  defaultLaps: 3,
  listOrder: "chronological",
};

test("buildPrompt includes target race and roster details", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.match(prompt, /Target race id: race-1/);
  assert.match(prompt, /ILCA 7/);
});

test("buildPrompt uses structured ROW / COLUMN sections with co-located context", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.doesNotMatch(prompt, /ROLE \+ CONTEXT/);
  assert.match(prompt, /# 1\. ROW HANDLING/);
  assert.match(prompt, /# 2\. COLUMN DEFINITIONS/);
  assert.match(prompt, /## Row index/);
  assert.match(prompt, /## Class \/ sail number/);
  assert.match(prompt, /## Time/);
  assert.match(prompt, /## Laps/);
  assert.match(prompt, /## Class \/ sail number[\s\S]*CLASS_ALIASES maps sheet text/);
  assert.match(prompt, /## Class \/ sail number[\s\S]*ENTRY_LIST/);
});

test("buildPrompt includes default class aliases when client sends empty object", () => {
  const prompt = buildPrompt({ ...baseContext, classAliases: {} }, "race-1");
  assert.match(prompt, /## Class \/ sail number[\s\S]*"Laser R":"ILCA 6"/);
  assert.doesNotMatch(prompt, /CLASS ALIASES maps sheet text → club class name: \{\}/);
});

test("buildPrompt requires boatClass.value to be the club class from aliases", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.match(prompt, /always set boatClass\.value to the CLUB_CLASS_NAME/i);
  assert.match(prompt, /NEVER put sheet text[\s\S]*in boatClass\.value when a CLASS_ALIASES matches/i);
  assert.match(prompt, /Radial \/ Laser R \/ LR → ILCA 6/i);
  assert.match(prompt, /Laser \/ L → ILCA 7/i);
});

test("buildPrompt requires row integrity and typewritten row index", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.match(prompt, /Row integrity:/i);
  assert.match(prompt, /Never take a competitor's time from a different row/i);
  assert.match(prompt, /typewritten integer row index/i);
  assert.match(prompt, /Copy that number into rowIndex/i);
});

test("buildPrompt blank time emits NOT FINISHED with MANUAL_CHECK", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.match(prompt, /Blank\/missing time/i);
  assert.match(prompt, /status to "NOT FINISHED"/);
  assert.match(prompt, /overallRowConfidence to MANUAL_CHECK/);
});

test("buildPrompt clock mode allows hour-only adjacent-row exception", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "clock_hms", defaultHour: 14 }, "race-1");
  assert.match(prompt, /Hour exception \(clock mode only\)/i);
  assert.match(prompt, /estimate hour from adjacent rows/i);
  assert.match(prompt, /defaultHour=14/);
  assert.match(prompt, /ONLY allowed use of data from another row/i);
});

test("buildPrompt renders stopwatch_ms_elapsed guidance", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "stopwatch_ms_elapsed" }, "race-1");
  assert.match(prompt, /STOPWATCH ELAPSED MINUTES\/SECONDS/);
  assert.match(prompt, /elapsedMinutes may be any non-negative integer/);
});

test("buildPrompt renders clock_hms guidance", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "clock_hms", defaultHour: 14 }, "race-1");
  assert.match(prompt, /CLOCK TIME \(H:M:S\)/);
  assert.match(prompt, /If only MM:SS is present/i);
});

test("buildPrompt renders stopwatch_hms_elapsed guidance", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "stopwatch_hms_elapsed" }, "race-1");
  assert.match(prompt, /STOPWATCH ELAPSED WITH HOURS/);
  assert.match(prompt, /Sub-hour times are MM:SS → set hours = 0/i);
});

test("buildPrompt requires normalized HH:mm:ss output format", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.match(prompt, /time\.value = \{ "hours": number, "minutes": number, "seconds": number \}/i);
  assert.doesNotMatch(prompt, /time\.value = \{ "elapsedMinutes": number, "seconds": number \}/i);
});

test("buildPrompt output structure mirrors stopwatch_ms_elapsed sheet scheme", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "stopwatch_ms_elapsed" }, "race-1");
  assert.match(prompt, /time\.value = \{ "elapsedMinutes": number, "seconds": number \}/i);
  assert.doesNotMatch(prompt, /time\.value = \{ "hours": number, "minutes": number, "seconds": number \}/i);
});

test("buildPrompt includes numeric lap rules when laps are present", () => {
  const prompt = buildPrompt({ ...baseContext, lapsPresentOnSheet: true }, "race-1");
  assert.match(prompt, /Laps column: PRESENT — numeric/);
  assert.match(prompt, /Read integer lap counts only/i);
  assert.doesNotMatch(prompt, /Count tallies\/checkmarks/i);
});

test("buildPrompt omits lap column when laps are absent", () => {
  const prompt = buildPrompt({ ...baseContext, lapsPresentOnSheet: false }, "race-1");
  assert.match(prompt, /Laps column: ABSENT/);
  assert.match(prompt, /Set laps to 1 for every row/i);
});

test("buildPrompt appends SPECIAL INSTRUCTIONS when specialInstructions is set", () => {
  const prompt = buildPrompt(
    { ...baseContext, specialInstructions: "Treat all empty hour fields as 20" },
    "race-1",
  );
  assert.match(prompt, /# 4\. SPECIAL INSTRUCTIONS/);
  assert.match(prompt, /Treat all empty hour fields as 20/);
  assert.match(prompt, /prefer these instructions for this scan/i);
});

test("buildPrompt omits SPECIAL INSTRUCTIONS when specialInstructions is empty or whitespace", () => {
  assert.doesNotMatch(buildPrompt(baseContext, "race-1"), /# 4\. SPECIAL INSTRUCTIONS/);
  assert.doesNotMatch(
    buildPrompt({ ...baseContext, specialInstructions: "   " }, "race-1"),
    /# 4\. SPECIAL INSTRUCTIONS/,
  );
});

const levelRatingContext: ScannerContext = {
  races: [
    {
      id: "race-a",
      seriesName: "Spring",
      raceNumber: 1,
      fleetClassName: "ILCA 7",
      entries: [{ id: "c1", class: "ILCA 7", sailNumber: "12345", name: "Sam" }],
    },
    {
      id: "race-b",
      seriesName: "Spring",
      raceNumber: 2,
      fleetClassName: "ILCA 6",
      entries: [{ id: "c2", class: "ILCA 6", sailNumber: "67890", name: "Alex" }],
    },
  ],
  listOrder: "unsorted",
  scanMode: "levelRating",
};

test("buildLevelRatingPrompt slims races and flattens entries with raceId", () => {
  const prompt = buildLevelRatingPrompt(levelRatingContext);
  assert.match(prompt, /LEVEL RATING/i);
  assert.match(prompt, /MULTIPLE races/i);
  assert.match(prompt, /RACES: \[\{"id":"race-a","name":"Spring R1","class":"ILCA 7"\}/);
  assert.match(prompt, /"id":"race-b","name":"Spring R2","class":"ILCA 6"/);
  assert.match(prompt, /"raceId":"race-a","id":"c1"/);
  assert.match(prompt, /"raceId":"race-b","id":"c2"/);
  assert.doesNotMatch(prompt, /scheduledStart/);
  assert.doesNotMatch(prompt, /ENTRY_LIST: \[\{"id":"c1"/);
});

test("buildLevelRatingPrompt requires competitor then raceId and swap-only swappedRowIndex", () => {
  const prompt = buildLevelRatingPrompt(levelRatingContext);
  assert.match(prompt, /Assign matchedCompetitorId first/i);
  assert.match(prompt, /Assign raceId second/i);
  assert.match(prompt, /copy that entry's raceId/i);
  assert.match(prompt, /match the row's class[\s\S]*RACES\[\]\.class/i);
  assert.match(prompt, /Omit swappedRowIndex when there is no arrow/i);
  assert.match(prompt, /Do not assign position/i);
  assert.doesNotMatch(prompt, /position\.value/i);
  assert.match(prompt, /FINISH ORDER/i);
  assert.match(prompt, /trailing digits/i);
  assert.match(prompt, /Linked arrows/i);
});

test("buildLevelRatingPrompt uses single-race wording when only one target race", () => {
  const prompt = buildLevelRatingPrompt({
    races: [{
      id: "race-a",
      seriesName: "Spring",
      raceNumber: 1,
      fleetClassName: "ILCA 7",
      entries: [{ id: "c1", class: "ILCA 7", sailNumber: "12345", name: "Sam" }],
    }],
    listOrder: "unsorted",
    scanMode: "levelRating",
  });
  assert.match(prompt, /single race/i);
  assert.doesNotMatch(prompt, /MULTIPLE races/i);
  assert.match(prompt, /Spring R1/);
  assert.match(prompt, /ILCA 7/);
  assert.match(prompt, /Assign matchedCompetitorId first/i);
  assert.match(prompt, /set raceId to "race-a"/i);
  assert.doesNotMatch(prompt, /position\.value/i);
});

test("buildLevelRatingPrompt appends SPECIAL INSTRUCTIONS as section 5", () => {
  const prompt = buildLevelRatingPrompt({
    ...levelRatingContext,
    specialInstructions: "Ignore margin doodles",
  });
  assert.match(prompt, /# 5\. SPECIAL INSTRUCTIONS/);
  assert.match(prompt, /Ignore margin doodles/);
});
