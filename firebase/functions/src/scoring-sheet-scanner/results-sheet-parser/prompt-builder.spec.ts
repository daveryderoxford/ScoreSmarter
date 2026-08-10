import test from "node:test";
import * as assert from "node:assert/strict";
import { buildPrompt } from "./prompt-builder.js";
import type { ScannerContext } from "../ai-scan-model.js";

const baseContext: ScannerContext = {
  targetRaces: ["race-1"],
  defaultLaps: 3,
  listOrder: "chronological",
  roster: [{ id: "comp-1", class: "ILCA 7", sailNumber: "12345", name: "Sam" }],
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
  assert.match(prompt, /## Class \/ sail number[\s\S]*CLASS ALIASES maps sheet text/);
  assert.match(prompt, /## Class \/ sail number[\s\S]*ENTRY LIST/);
});

test("buildPrompt includes default class aliases when client sends empty object", () => {
  const prompt = buildPrompt({ ...baseContext, classAliases: {} }, "race-1");
  assert.match(prompt, /## Class \/ sail number[\s\S]*"Laser R":"ILCA 6"/);
  assert.doesNotMatch(prompt, /CLASS ALIASES maps sheet text → club class name: \{\}/);
});

test("buildPrompt requires boatClass.value to be the club class from aliases", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.match(prompt, /Always set boatClass\.value to the club class name/i);
  assert.match(prompt, /Never put sheet abbreviations[\s\S]*in boatClass\.value when an alias exists/i);
  assert.match(prompt, /put the sheet text in boatClass\.alternatives/i);
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
