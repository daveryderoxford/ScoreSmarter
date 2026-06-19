import test from "node:test";
import * as assert from "node:assert/strict";
import {
  calculateRealizedApiCost,
  DEFAULT_SCAN_COST_OPTIONS,
} from "./api-cost-estimation.js";

test("calculateRealizedApiCost applies gemini-3.5-flash pricing with UK billing defaults", () => {
  const cost = calculateRealizedApiCost(
    "gemini-3.5-flash",
    1_000_000,
    1_000_000,
    DEFAULT_SCAN_COST_OPTIONS,
  );
  assert.equal(cost, (1.5 + 9.0) * 0.76 * 1.20);
});

test("calculateRealizedApiCost uses over-200k tier for long-context pro models", () => {
  const under = calculateRealizedApiCost("gemini-2.5-pro", 200_000, 1_000, DEFAULT_SCAN_COST_OPTIONS);
  const over = calculateRealizedApiCost("gemini-2.5-pro", 200_001, 1_000, DEFAULT_SCAN_COST_OPTIONS);
  assert.notEqual(under, over);
  assert.equal(over! > under!, true);
});

test("calculateRealizedApiCost returns null for unknown models", () => {
  assert.equal(calculateRealizedApiCost("unknown-model", 100, 100), null);
});
