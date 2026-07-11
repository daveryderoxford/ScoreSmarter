import test from "node:test";
import * as assert from "node:assert/strict";
import { validateAndNormalizeTimes } from "./single-pass-ai-parser.js";

test("validateAndNormalizeTimes accepts clock_hms", () => {
  const parsed = {
    scannedResults: [{ rowIndex: 1, status: "OK", time: { value: { hours: 14, minutes: 23, seconds: 10 } } }],
  };
  validateAndNormalizeTimes(parsed, "req-1", "clock_hms");
  assert.equal(parsed.scannedResults[0].time.value, "14:23:10");
});

test("validateAndNormalizeTimes accepts MM:SS for clock_hms using defaultHour", () => {
  const parsed = {
    scannedResults: [{
      rowIndex: 1,
      status: "OK",
      time: { value: { elapsedMinutes: 45, seconds: 30 }, confidence: "HIGH" },
      overallRowConfidence: "HIGH",
    }],
  };
  validateAndNormalizeTimes(parsed, "req-2", "clock_hms", 14);
  assert.equal(parsed.scannedResults[0].time.value, "14:45:30");
});

test("validateAndNormalizeTimes accepts stopwatch_hms_elapsed", () => {
  const parsed = {
    scannedResults: [{ rowIndex: 1, status: "OK", time: { value: { hours: 1, minutes: 2, seconds: 15 } } }],
  };
  validateAndNormalizeTimes(parsed, "req-3", "stopwatch_hms_elapsed");
  assert.equal(parsed.scannedResults[0].time.value, "01:02:15");
});

test("validateAndNormalizeTimes sets stopwatch_hms_elapsed hour to 00 when omitted", () => {
  const parsed = {
    scannedResults: [{ rowIndex: 1, status: "OK", time: { value: { minutes: 45, seconds: 30 } } }],
  };
  validateAndNormalizeTimes(parsed, "req-3b", "stopwatch_hms_elapsed");
  assert.equal(parsed.scannedResults[0].time.value, "00:45:30");
});

test("validateAndNormalizeTimes normalizes stopwatch_ms_elapsed to HH:mm:ss", () => {
  const parsed = {
    scannedResults: [{ rowIndex: 1, status: "OK", time: { value: { elapsedMinutes: 45, seconds: 30 } } }],
  };
  validateAndNormalizeTimes(parsed, "req-4", "stopwatch_ms_elapsed");
  assert.equal(parsed.scannedResults[0].time.value, "00:45:30");
});

test("validateAndNormalizeTimes carries stopwatch_ms_elapsed minutes overflow into hours", () => {
  const parsed = {
    scannedResults: [{ rowIndex: 1, status: "OK", time: { value: { elapsedMinutes: 75, seconds: 30 } } }],
  };
  validateAndNormalizeTimes(parsed, "req-4b", "stopwatch_ms_elapsed");
  assert.equal(parsed.scannedResults[0].time.value, "01:15:30");
});

test("validateAndNormalizeTimes clears invalid times and downgrades confidence", () => {
  const badMs = {
    scannedResults: [{
      rowIndex: 1,
      status: "OK",
      time: { value: { elapsedMinutes: 12, seconds: 75 }, confidence: "HIGH" },
      overallRowConfidence: "HIGH",
    }],
  };
  const badHms = {
    scannedResults: [{
      rowIndex: 2,
      status: "OK",
      time: { value: { hours: 99, minutes: 99, seconds: 99 }, confidence: "HIGH" },
      overallRowConfidence: "HIGH",
    }],
  };
  validateAndNormalizeTimes(badMs, "req-5", "stopwatch_ms_elapsed");
  validateAndNormalizeTimes(badHms, "req-6", "stopwatch_hms_elapsed");
  assert.equal(badMs.scannedResults[0].time.value, "");
  assert.equal(badMs.scannedResults[0].time.confidence, "MANUAL_CHECK");
  assert.equal(badMs.scannedResults[0].overallRowConfidence, "MANUAL_CHECK");
  assert.equal(badHms.scannedResults[0].time.value, "");
  assert.equal(badHms.scannedResults[0].time.confidence, "MANUAL_CHECK");
  assert.equal(badHms.scannedResults[0].overallRowConfidence, "MANUAL_CHECK");
});

test("validateAndNormalizeTimes empties non-finish row time", () => {
  const parsed = {
    scannedResults: [{
      rowIndex: 3,
      status: "DNS",
      time: {
        value: { hours: 14, minutes: 23, seconds: 10 },
        alternatives: [{ hours: 14, minutes: 23, seconds: 12 }],
      },
    }],
  };
  validateAndNormalizeTimes(parsed, "req-7", "clock_hms");
  assert.equal(parsed.scannedResults[0].time.value, "");
  assert.deepEqual(parsed.scannedResults[0].time.alternatives, []);
});

test("validateAndNormalizeTimes normalizes time.alternatives to HH:mm:ss strings", () => {
  const parsed = {
    scannedResults: [{
      rowIndex: 1,
      status: "OK",
      time: {
        value: { hours: 14, minutes: 45, seconds: 23 },
        confidence: "HIGH",
        alternatives: [
          { hours: 14, minutes: 45, seconds: 28 },
          { hours: 14, minutes: 46, seconds: 23 },
          { hours: 14, minutes: 45, seconds: 23 }, // duplicate of primary
          { hours: 99, minutes: 99, seconds: 99 }, // invalid
          { hours: 14, minutes: 45, seconds: 28 }, // duplicate alt
        ],
      },
    }],
  };
  validateAndNormalizeTimes(parsed, "req-8", "clock_hms");
  assert.equal(parsed.scannedResults[0].time.value, "14:45:23");
  assert.deepEqual(parsed.scannedResults[0].time.alternatives, ["14:45:28", "14:46:23"]);
});

test("validateAndNormalizeTimes keeps readable alternatives when primary time is invalid", () => {
  const parsed = {
    scannedResults: [{
      rowIndex: 1,
      status: "OK",
      time: {
        value: { hours: 99, minutes: 99, seconds: 99 },
        confidence: "HIGH",
        alternatives: [{ hours: 14, minutes: 45, seconds: 23 }],
      },
      overallRowConfidence: "HIGH",
    }],
  };
  validateAndNormalizeTimes(parsed, "req-9", "clock_hms");
  assert.equal(parsed.scannedResults[0].time.value, "");
  assert.equal(parsed.scannedResults[0].time.confidence, "MANUAL_CHECK");
  assert.deepEqual(parsed.scannedResults[0].time.alternatives, ["14:45:23"]);
});
