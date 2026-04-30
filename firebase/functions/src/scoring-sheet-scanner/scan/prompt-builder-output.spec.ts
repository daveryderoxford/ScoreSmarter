import test from "node:test";
import * as assert from "node:assert/strict";
import { buildPrompt } from "./prompt-builder.js";
import type { ScannerContext, ScannerTimeFormat } from "../ai-scan-types.js";

const baseContext: ScannerContext = {
  targetRaces: ["race-1"],
  lapFormat: "numbers",
  defaultLaps: 3,
  hasHours: false,
  defaultHour: 14,
  listOrder: "chronological",
  roster: [{ id: "comp-1", class: "ILCA 7", sailNumber: "12345", name: "Sam" }],
};

const modes: ScannerTimeFormat[] = ["clock_hms", "stopwatch_hms_elapsed", "stopwatch_ms_elapsed"];

for (const mode of modes) {
  test(`prompt output snapshot for ${mode}`, () => {
    const prompt = buildPrompt({ ...baseContext, timeFormat: mode }, "race-1");
    assert.ok(prompt.length > 100);

    // Intentional output for review/refinement while iterating on prompt wording.
    console.log(`\n===== PROMPT (${mode}) =====\n${prompt}\n===== END PROMPT (${mode}) =====\n`);
  });
}
