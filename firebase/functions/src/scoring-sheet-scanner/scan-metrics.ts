import type { ScanExecutionMetrics } from "@shared/scan-metrics";
import type { ScannerThinkingLevel } from "@shared/scanner-context";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { calculateRealizedApiCost, DEFAULT_SCAN_COST_OPTIONS } from "./api-cost-estimation.js";

export type { ScanExecutionMetrics };

export const SCAN_PARSER_NAME = "AIParser" as const;

export interface ScanTokenCapture {
  executionTimeSec: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedApiCostUsd: number | null;
}

export interface ScanQualityMetrics {
  competitorCount: number;
  matchedCount: number;
  unmatchedCount: number;
  highConfidenceRowCount: number;
  lowConfidenceRowCount: number;
  suspectFieldCounts: {
    boatClass: number;
    sailNumber: number;
    competitorName: number;
    time: number;
    laps: number;
  };
}

export interface ScanRaceSummary {
  raceId: string;
  seriesName?: string;
  raceNumber?: number;
  scheduledStart?: Timestamp;
}

export interface ScanMetricsDocument {
  clubId: string;
  race: ScanRaceSummary;
  scannedAt: ReturnType<typeof FieldValue.serverTimestamp>;
  requestId: string;
  uid?: string;
  parser: typeof SCAN_PARSER_NAME;
  model: string;
  thinkingLevel?: ScannerThinkingLevel;
  location: string;
  success: boolean;
  errorMessage?: string;
  competitorCount: number;
  matchedCount: number;
  unmatchedCount: number;
  highConfidenceRowCount: number;
  lowConfidenceRowCount: number;
  suspectFieldCounts: ScanQualityMetrics["suspectFieldCounts"];
  executionTimeSec: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedApiCostUsd: number | null;
  /** Full AI prompt text when scan was run with sys-admin debug enabled. */
  aiPrompt?: string;
}

export function estimateApiCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  return calculateRealizedApiCost(
    model,
    inputTokens,
    outputTokens,
    DEFAULT_SCAN_COST_OPTIONS,
  );
}

export function captureTokenUsage(
  model: string,
  startMs: number,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): ScanTokenCapture {
  const input = typeof inputTokens === "number" ? inputTokens : null;
  const output = typeof outputTokens === "number" ? outputTokens : null;
  const estimatedApiCostUsd = estimateApiCost(model, input, output);
  return {
    executionTimeSec: Number(((Date.now() - startMs) / 1000).toFixed(2)),
    inputTokens: input,
    outputTokens: output,
    estimatedApiCostUsd: estimatedApiCostUsd == null ? null : Number(estimatedApiCostUsd.toFixed(5)),
  };
}

function isLowConfidence(confidence: unknown): boolean {
  return confidence !== "HIGH";
}

function countSuspectField(field: { confidence?: unknown } | undefined): number {
  if (!field || typeof field !== "object") return 0;
  return isLowConfidence(field.confidence) ? 1 : 0;
}

export function extractScanQualityMetrics(parsed: unknown): ScanQualityMetrics {
  const empty: ScanQualityMetrics = {
    competitorCount: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    highConfidenceRowCount: 0,
    lowConfidenceRowCount: 0,
    suspectFieldCounts: {
      boatClass: 0,
      sailNumber: 0,
      competitorName: 0,
      time: 0,
      laps: 0,
    },
  };

  if (typeof parsed !== "object" || parsed === null) return empty;
  const rows = (parsed as { scannedResults?: unknown }).scannedResults;
  if (!Array.isArray(rows)) return empty;

  const suspectFieldCounts = { ...empty.suspectFieldCounts };
  let matchedCount = 0;
  let highConfidenceRowCount = 0;
  let lowConfidenceRowCount = 0;

  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const rowObj = row as {
      matchedCompetitorId?: unknown;
      overallRowConfidence?: unknown;
      boatClass?: { confidence?: unknown };
      sailNumber?: { confidence?: unknown };
      competitorName?: { confidence?: unknown };
      time?: { confidence?: unknown };
      laps?: { confidence?: unknown };
    };

    if (typeof rowObj.matchedCompetitorId === "string" && rowObj.matchedCompetitorId.length > 0) {
      matchedCount += 1;
    }

    if (rowObj.overallRowConfidence === "HIGH") {
      highConfidenceRowCount += 1;
    } else {
      lowConfidenceRowCount += 1;
    }

    suspectFieldCounts.boatClass += countSuspectField(rowObj.boatClass);
    suspectFieldCounts.sailNumber += countSuspectField(rowObj.sailNumber);
    suspectFieldCounts.competitorName += countSuspectField(rowObj.competitorName);
    suspectFieldCounts.time += countSuspectField(rowObj.time);
    suspectFieldCounts.laps += countSuspectField(rowObj.laps);
  }

  const competitorCount = rows.length;
  return {
    competitorCount,
    matchedCount,
    unmatchedCount: competitorCount - matchedCount,
    highConfidenceRowCount,
    lowConfidenceRowCount,
    suspectFieldCounts,
  };
}

export function buildExecutionMetrics(params: {
  success: boolean;
  errorMessage?: string;
  model: string;
  thinkingLevel?: ScannerThinkingLevel;
  location: string;
  tokenCapture: ScanTokenCapture;
  requestId?: string;
}): ScanExecutionMetrics {
  return {
    success: params.success,
    ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
    parser: SCAN_PARSER_NAME,
    model: params.model,
    ...(params.thinkingLevel ? { thinkingLevel: params.thinkingLevel } : {}),
    location: params.location,
    executionTimeSec: params.tokenCapture.executionTimeSec,
    inputTokens: params.tokenCapture.inputTokens,
    outputTokens: params.tokenCapture.outputTokens,
    estimatedApiCostUsd: params.tokenCapture.estimatedApiCostUsd,
    ...(params.requestId ? { requestId: params.requestId } : {}),
  };
}

export function buildScanMetricsDocument(params: {
  clubId: string;
  race: ScanRaceSummary;
  requestId: string;
  uid?: string;
  execution: ScanExecutionMetrics;
  quality: ScanQualityMetrics;
  /** When set (sys-admin debug scans), stored as `aiPrompt` on the metrics doc. */
  aiPrompt?: string;
}): ScanMetricsDocument {
  return {
    clubId: params.clubId,
    race: params.race,
    scannedAt: FieldValue.serverTimestamp(),
    requestId: params.requestId,
    ...(params.uid ? { uid: params.uid } : {}),
    parser: SCAN_PARSER_NAME,
    model: params.execution.model,
    ...(params.execution.thinkingLevel
      ? { thinkingLevel: params.execution.thinkingLevel }
      : {}),
    location: params.execution.location,
    success: params.execution.success,
    ...(params.execution.errorMessage ? { errorMessage: params.execution.errorMessage } : {}),
    competitorCount: params.quality.competitorCount,
    matchedCount: params.quality.matchedCount,
    unmatchedCount: params.quality.unmatchedCount,
    highConfidenceRowCount: params.quality.highConfidenceRowCount,
    lowConfidenceRowCount: params.quality.lowConfidenceRowCount,
    suspectFieldCounts: params.quality.suspectFieldCounts,
    executionTimeSec: params.execution.executionTimeSec,
    inputTokens: params.execution.inputTokens,
    outputTokens: params.execution.outputTokens,
    estimatedApiCostUsd: params.execution.estimatedApiCostUsd,
    ...(params.aiPrompt ? { aiPrompt: params.aiPrompt } : {}),
  };
}
