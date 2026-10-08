import test from "node:test";
import * as assert from "node:assert/strict";
import {
  DEFAULT_SCAN_LOCATION,
  DEFAULT_SCAN_MODEL,
  DEFAULT_SCAN_THINKING_LEVEL,
  parseSystemScanAiConfig,
  resolveScanModelParams,
} from "./ai-scan-model.js";

test("parseSystemScanAiConfig uses hardcoded fallbacks when the doc is missing", () => {
  assert.deepEqual(parseSystemScanAiConfig(undefined), {
    model: DEFAULT_SCAN_MODEL,
    thinkingLevel: DEFAULT_SCAN_THINKING_LEVEL,
  });
});

test("parseSystemScanAiConfig reads a valid system document", () => {
  assert.deepEqual(
    parseSystemScanAiConfig({
      model: "gemini-3.1-pro-preview",
      thinkingLevel: "HIGH",
    }),
    {
      model: "gemini-3.1-pro-preview",
      thinkingLevel: "high",
    },
  );
});

test("parseSystemScanAiConfig ignores an invalid thinking level", () => {
  const parsed = parseSystemScanAiConfig({
    model: "  gemini-3.5-flash  ",
    thinkingLevel: "ultra",
  });
  assert.equal(parsed.model, "gemini-3.5-flash");
  assert.equal(parsed.thinkingLevel, DEFAULT_SCAN_THINKING_LEVEL);
});

test("resolveScanModelParams uses system defaults for non-admin callers", () => {
  const system = { model: "gemini-3.5-flash", thinkingLevel: "low" as const };
  const params = resolveScanModelParams(system, "gemini-3.1-pro-preview", "high", false);
  assert.deepEqual(params, {
    model: "gemini-3.5-flash",
    location: DEFAULT_SCAN_LOCATION,
    thinkingLevel: "low",
  });
});

test("resolveScanModelParams lets a sys-admin override model and thinking", () => {
  const system = { model: "gemini-3.5-flash", thinkingLevel: "low" as const };
  const params = resolveScanModelParams(system, "gemini-3.1-pro-preview", "high", true);
  assert.equal(params.model, "gemini-3.1-pro-preview");
  assert.equal(params.thinkingLevel, "high");
});

test("resolveScanModelParams sys-admin empty client values keep the system default", () => {
  const system = { model: "gemini-3.5-flash", thinkingLevel: "low" as const };
  const params = resolveScanModelParams(system, "  ", "", true);
  assert.equal(params.model, "gemini-3.5-flash");
  assert.equal(params.thinkingLevel, "low");
});
