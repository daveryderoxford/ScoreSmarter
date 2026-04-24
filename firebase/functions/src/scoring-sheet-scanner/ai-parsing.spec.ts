import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "./ai-parsing";
import type { ScannerContext } from "./types";

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
  assert.match(prompt, /Expected Competitor Roster/);
  assert.match(prompt, /ILCA 7/);
});

test("buildPrompt renders minutes_seconds_only guidance", () => {
  const prompt = buildPrompt({ ...baseContext, timeFormat: "minutes_seconds_only" }, "race-1");
  assert.match(prompt, /MINUTES AND SECONDS ONLY/);
  assert.match(prompt, /Treat two-part times as MM:SS/);
});
