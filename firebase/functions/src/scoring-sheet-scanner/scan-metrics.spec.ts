import test from "node:test";
import * as assert from "node:assert/strict";
import {
  captureTokenUsage,
  estimateApiCost,
  extractScanQualityMetrics,
} from "./scan-metrics.js";

test("estimateApiCostUsd delegates to calculateRealizedApiCost", () => {
  const cost = estimateApiCost("gemini-3.5-flash", 1_000_000, 1_000_000);
  assert.equal(cost, (1.5 + 9.0) * 0.76 * 1.20);
});

test("estimateApiCostUsd returns null when tokens are missing", () => {
  assert.equal(estimateApiCost("gemini-3.5-flash", null, 100), null);
});

test("captureTokenUsage rounds execution time and cost", () => {
  const start = Date.now() - 1250;
  const capture = captureTokenUsage("gemini-3.5-flash", start, 1000, 500);
  assert.equal(capture.executionTimeSec >= 1.24, true);
  assert.equal(capture.inputTokens, 1000);
  assert.equal(capture.outputTokens, 500);
  assert.equal(typeof capture.estimatedApiCostUsd, "number");
});

test("extractScanQualityMetrics counts matched and suspect fields", () => {
  const quality = extractScanQualityMetrics({
    scannedResults: [
      {
        matchedCompetitorId: "c1",
        overallRowConfidence: "HIGH",
        boatClass: { confidence: "HIGH" },
        sailNumber: { confidence: "MANUAL_CHECK" },
        time: { confidence: "HIGH" },
      },
      {
        overallRowConfidence: "MANUAL_CHECK",
        boatClass: { confidence: "FAILED" },
        sailNumber: { confidence: "HIGH" },
        competitorName: { confidence: "AMBIGUOUS" },
        time: { confidence: "MANUAL_CHECK" },
        laps: { confidence: "HIGH" },
      },
    ],
  });

  assert.equal(quality.competitorCount, 2);
  assert.equal(quality.matchedCount, 1);
  assert.equal(quality.unmatchedCount, 1);
  assert.equal(quality.highConfidenceRowCount, 1);
  assert.equal(quality.lowConfidenceRowCount, 1);
  assert.equal(quality.suspectFieldCounts.sailNumber, 1);
  assert.equal(quality.suspectFieldCounts.boatClass, 1);
  assert.equal(quality.suspectFieldCounts.competitorName, 1);
  assert.equal(quality.suspectFieldCounts.time, 1);
});
