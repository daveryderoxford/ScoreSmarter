import test from "node:test";
import * as assert from "node:assert/strict";
import { buildPrompt } from "./prompt-builder.js";
import type { ScannerContext } from "./ai-scan-types.js";

const baseContext: ScannerContext = {
  targetRaces: ["race-1"],
  lapFormat: "numbers",
  defaultLaps: 3,
  hasHours: false,
  listOrder: "chronological",
  roster: [{ id: "comp-1", class: "ILCA 7", sailNumber: "12345", name: "Sam" }],
};

test("buildPrompt includes target race and roster details", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.match(prompt, /Target race id: race-1/);
  assert.match(prompt, /ILCA 7/);
});

test("buildPrompt renders stopwatch_ms_elapsed guidance", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "stopwatch_ms_elapsed" }, "race-1");
  assert.match(prompt, /STOPWATCH ELAPSED MINUTES\/SECONDS/);
  assert.match(prompt, /All times will be recorded as elapsed minutes, seconds/);
});

test("buildPrompt renders clock_hms guidance", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "clock_hms", defaultHour: 14 }, "race-1");
  assert.match(prompt, /CLOCK TIME \(H:M:S\)/);
  assert.match(prompt, /two-part value may be written as MM:SS/i);
});

test("buildPrompt renders stopwatch_hms_elapsed guidance", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "stopwatch_hms_elapsed" }, "race-1");
  assert.match(prompt, /STOPWATCH ELAPSED WITH HOURS/);
  assert.match(prompt, /If only MM:SS is present, treat it as sub-hour elapsed and set hours = 0/i);
});

test("buildPrompt requires normalized HH:mm:ss output format", () => {
  const prompt = buildPrompt(baseContext, "race-1");
  assert.match(prompt, /OUTPUT TIME STRUCTURE \(REQUIRED\)/i);
  assert.match(prompt, /This sheet uses clock time \(H:M:S\)/i);
  assert.match(prompt, /time\.value = \{ "hours": number, "minutes": number, "seconds": number \}/i);
  assert.doesNotMatch(prompt, /time\.value = \{ "elapsedMinutes": number, "seconds": number \}/i);
});

test("buildPrompt output structure mirrors stopwatch_ms_elapsed sheet scheme", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "stopwatch_ms_elapsed" }, "race-1");
  assert.match(prompt, /This sheet uses stopwatch elapsed minutes\/seconds \(MM:SS\)/i);
  assert.match(prompt, /time\.value = \{ "elapsedMinutes": number, "seconds": number \}/i);
  assert.doesNotMatch(prompt, /time\.value = \{ "hours": number, "minutes": number, "seconds": number \}/i);
});

test("buildPrompt numbers lap mode excludes tally instructions", () => {
  const prompt = buildPrompt({ ...baseContext, lapFormat: "numbers", lapsPresentOnSheet: true }, "race-1");
  assert.match(prompt, /LAP COLUMN PRESENT — NUMERIC FORMAT/);
  assert.match(prompt, /Ignore tally\/checkmark interpretation in this mode/i);
  assert.doesNotMatch(prompt, /Interpret lap marks as tallies\/checkmarks/i);
});

test("buildPrompt ticks lap mode excludes numeric-only instructions", () => {
  const prompt = buildPrompt({ ...baseContext, lapFormat: "ticks", lapsPresentOnSheet: true }, "race-1");
  assert.match(prompt, /LAP COLUMN PRESENT — TICKS\/TALLIES FORMAT/);
  assert.match(prompt, /Interpret lap marks as tallies\/checkmarks/i);
  assert.doesNotMatch(prompt, /Read lap counts only as explicit numbers/i);
});
