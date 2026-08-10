import { randomUUID } from "crypto";
import { type DocumentData, FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall } from "firebase-functions/v2/https";
import {
  RaceCompetitorDoc,
  ScannerContext,
  ScannerTimeFormat,
  SeriesEntryDoc,
  logScan,
  logScanError,
} from "../ai-scan-model.js";
import { mergeClassAliases } from "./class-aliases.js";
import { normalizeScanStrategy, resolveStrategyExecution } from "./scan-strategy.js";
import { resultsSheetStoragePath } from "../image-upload/image-storage.js";
import { detailedHttpsError } from "../../shared/https-error.js";
import { assertAuthenticated, assertCallerRole } from "../../shared/authorisation.js";
import {
  buildExecutionMetrics,
  buildScanMetricsDocument,
  extractScanQualityMetrics,
  type ScanExecutionMetrics,
  type ScanRaceSummary,
  type ScanTokenCapture,
} from "../scan-metrics.js";

function db() {
  return getFirestore();
}

interface ParseStoredResultsSheetRequest {
  scannerContext: ScannerContext;
  clubId: string;
  raceId: string;
}

function normalizeScannerTimeFormat(value: unknown): ScannerTimeFormat {
  if (value === "clock_hms" || value === "stopwatch_hms_elapsed" || value === "stopwatch_ms_elapsed") {
    return value;
  }
  return "clock_hms";
}

function seriesEntryFromDoc(raw: DocumentData): SeriesEntryDoc {
  const sail = raw["sailNumber"];
  return {
    helm: typeof raw["helm"] === "string" ? raw["helm"] : undefined,
    boatClass: typeof raw["boatClass"] === "string" ? raw["boatClass"] : undefined,
    sailNumber: typeof sail === "string" && sail.length > 0 ? sail : undefined,
  };
}

async function getRaceCompetitors(
  clubId: string,
  raceId: string,
  requestId: string,
): Promise<Array<{ id: string; class: string; sailNumber: string; name?: string; }>> {
  logScan(requestId, "build_roster", "Querying race-results for race", { clubId, raceId });

  const compSnap = await db()
    .collection(`clubs/${clubId}/race-results`)
    .where("raceId", "==", raceId)
    .get();

  if (compSnap.empty) {
    logScan(requestId, "build_roster", "No race-results documents for raceId; continuing with empty roster", {
      clubId,
      raceId,
    });
    return [];
  }

  const entryIds = [...new Set(
    compSnap.docs
      .map((d) => (d.data() as RaceCompetitorDoc).seriesEntryId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  )];

  const entryRefs = entryIds.map((id) => db().doc(`clubs/${clubId}/series-entries/${id}`));
  const entrySnaps = entryRefs.length > 0 ? await db().getAll(...entryRefs) : [];

  const entryById = new Map<string, SeriesEntryDoc>();
  for (const snap of entrySnaps) {
    if (snap.exists) {
      entryById.set(snap.id, seriesEntryFromDoc(snap.data() ?? {}));
    }
  }

  const competitors: Array<{ id: string; class: string; sailNumber: string; name?: string; }> = [];
  for (const doc of compSnap.docs) {
    const comp = doc.data() as RaceCompetitorDoc;
    const sid = comp.seriesEntryId;
    if (!sid) continue;

    const entry = entryById.get(sid);
    if (!entry) continue;

    const boatClass = (entry.boatClass ?? "").trim();
    const helm = (entry.helm ?? "").trim();
    const sailText = entry.sailNumber ?? "";
    if (!boatClass || !sailText) {
      continue;
    }
    competitors.push({
      id: doc.id,
      class: boatClass,
      sailNumber: sailText,
      name: helm || undefined,
    });
  }

  if (competitors.length === 0) {
    logScan(requestId, "build_roster", "No roster entries after resolving series entries; continuing with empty roster", {
      clubId,
      raceId,
    });
    return [];
  }

  competitors.sort((a, b) => {
    const c = a.class.localeCompare(b.class);
    if (c !== 0) return c;
    return a.sailNumber.localeCompare(b.sailNumber, undefined, { numeric: true });
  });

  return competitors;
}

async function loadRaceSummary(clubId: string, raceId: string): Promise<ScanRaceSummary> {
  const summary: ScanRaceSummary = { raceId };
  try {
    const snap = await db().doc(`clubs/${clubId}/races/${raceId}`).get();
    if (!snap.exists) return summary;
    const data = snap.data() ?? {};
    if (typeof data["seriesName"] === "string") summary.seriesName = data["seriesName"];
    if (typeof data["index"] === "number") summary.raceNumber = data["index"];
    const scheduledStart = data["scheduledStart"];
    if (scheduledStart && typeof scheduledStart.toDate === "function") {
      summary.scheduledStart = scheduledStart;
    }
  } catch {
    // Race metadata is optional for metrics persistence.
  }
  return summary;
}

async function persistScanMetrics(
  requestId: string,
  doc: ReturnType<typeof buildScanMetricsDocument>,
): Promise<void> {
  try {
    await db().doc(`system/private/scans/${requestId}`).set(doc);
    logScan(requestId, "persist_scan_metrics", "Saved scan metrics", {
      scanId: requestId,
      clubId: doc.clubId,
      success: doc.success,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logScanError(requestId, "persist_scan_metrics", `Failed to save scan metrics: ${msg}`, {
      cause: "firestore_set_failed",
      clubId: doc.clubId,
    });
  }
}

function emptyTokenCapture(): ScanTokenCapture {
  return {
    executionTimeSec: 0,
    inputTokens: null,
    outputTokens: null,
    estimatedApiCostUsd: null,
  };
}

function buildCallableScanResponse(
  parsed: Record<string, unknown>,
  metrics: ScanExecutionMetrics,
): Record<string, unknown> {
  return {
    ...extractScanResponseForPersistence(parsed),
    metrics,
  };
}

export function validateStoredRequest(data: unknown, requestId: string): ParseStoredResultsSheetRequest {
  const requestData = data as ParseStoredResultsSheetRequest;
  const { scannerContext, clubId, raceId } = requestData;

  if (!scannerContext) {
    throw detailedHttpsError("invalid-argument", "Missing scanner context.", {
      requestId,
      stage: "validate_input",
      cause: "missing_context",
    });
  }
  if (!clubId || typeof clubId !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing clubId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_club_id",
    });
  }
  if (!raceId || typeof raceId !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing raceId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_race_id",
    });
  }
  return {
    scannerContext,
    clubId,
    raceId,
  };
}

/** Scan payload persisted for client resume (`clubs/{clubId}/scan-results/{raceId}`). */
export function extractScanResponseForPersistence(parsed: Record<string, unknown>): {
  scannedResults: unknown[];
  pageNotes?: string;
  unreadableRowsCount: number;
} {
  return {
    scannedResults: Array.isArray(parsed.scannedResults) ? parsed.scannedResults : [],
    unreadableRowsCount:
      typeof parsed.unreadableRowsCount === "number" ? parsed.unreadableRowsCount : 0,
    ...(typeof parsed.pageNotes === "string" ? { pageNotes: parsed.pageNotes } : {}),
  };
}

async function persistScanResponse(
  requestId: string,
  clubId: string,
  raceId: string,
  parsed: unknown,
): Promise<void> {
  const scanResponse = extractScanResponseForPersistence(parsed as Record<string, unknown>);
  try {
    await db().doc(`clubs/${clubId}/scan-results/${raceId}`).set(
      {
        scanResponse,
        scannedAt: FieldValue.serverTimestamp(),
        requestId,
      },
      { merge: true },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logScanError(requestId, "persist_scan_response", `Failed to save scan response: ${msg}`, {
      cause: "firestore_set_failed",
      clubId,
      raceId,
    });
    throw detailedHttpsError("internal", "Failed to save scan response. Check logs for requestId.", {
      requestId,
      stage: "persist_scan_response",
      cause: "firestore_set_failed",
      firestoreMessage: msg.slice(0, 500),
    });
  }
  logScan(requestId, "persist_scan_response", "Saved scan response for race", {
    clubId,
    raceId,
    rowCount: scanResponse.scannedResults.length,
  });
}

async function parseFromStoredImage(
  requestId: string,
  clubId: string,
  raceId: string,
  scannerContext: ScannerContext,
  uid?: string,
) {
  const parseStartMs = Date.now();
  const storagePath = resultsSheetStoragePath(clubId, raceId);
  const scanStrategy = normalizeScanStrategy(scannerContext.scanStrategy);
  const execution = resolveStrategyExecution(scanStrategy);
  const raceSummary = await loadRaceSummary(clubId, raceId);
  const tokenCapture = emptyTokenCapture();
  let parsed: unknown = null;
  let executionMetrics: ScanExecutionMetrics | undefined;
  let caughtError: unknown;

  try {
    const roster = await getRaceCompetitors(clubId, raceId, requestId);
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      logScanError(requestId, "save_image", "No results sheet image in storage for race", {
        clubId,
        raceId,
        storagePath,
        cause: "missing_sheet_image",
      });
      throw detailedHttpsError(
        "failed-precondition",
        "No results sheet image for this race. Capture or upload a sheet first.",
        { requestId, stage: "save_image", cause: "missing_sheet_image", clubId, raceId },
      );
    }
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    const imageMimeType = metadata.contentType || "image/jpeg";
    const imageBase64 = buffer.toString("base64");

    const mergedContext: ScannerContext = {
      ...scannerContext,
      timeFormat: normalizeScannerTimeFormat(scannerContext.timeFormat),
      classAliases: mergeClassAliases(scannerContext.classAliases),
      roster,
      targetRaces: [raceId, ...(scannerContext.targetRaces ?? [])].filter(
        (id, i, arr) => arr.indexOf(id) === i,
      ),
    };
    logScan(requestId, "merge_scanner_context", "Merged Firestore roster into scanner context", {
      targetRaces: mergedContext.targetRaces,
      listOrder: mergedContext.listOrder,
      defaultHour: mergedContext.defaultHour,
      defaultLaps: mergedContext.defaultLaps,
      lapsPresentOnSheet: mergedContext.lapsPresentOnSheet ?? true,
      timeFormat: mergedContext.timeFormat ?? "clock_hms",
      storagePath,
    });

    logScan(requestId, "merge_scanner_context", "Resolved scan strategy for AI parser", {
      scanStrategy: execution.strategy,
      model: execution.model,
      location: execution.location,
    });

    parsed = await execution.parser(
      execution,
      requestId,
      imageBase64,
      imageMimeType,
      mergedContext,
      raceId,
      tokenCapture,
    );

    if (parsed !== null) {
      await persistScanResponse(requestId, clubId, raceId, parsed);
    }

    executionMetrics = buildExecutionMetrics({
      success: true,
      strategy: execution.strategy,
      model: execution.model,
      location: execution.location,
      tokenCapture: tokenCapture.executionTimeSec > 0
        ? tokenCapture
        : {
          ...tokenCapture,
          executionTimeSec: Number(((Date.now() - parseStartMs) / 1000).toFixed(2)),
        },
    });
  } catch (e: unknown) {
    caughtError = e;
    const errorMessage = e instanceof Error ? e.message : String(e);
    executionMetrics = buildExecutionMetrics({
      success: false,
      errorMessage,
      strategy: execution.strategy,
      model: execution.model,
      location: execution.location,
      tokenCapture: tokenCapture.executionTimeSec > 0
        ? tokenCapture
        : {
          ...tokenCapture,
          executionTimeSec: Number(((Date.now() - parseStartMs) / 1000).toFixed(2)),
        },
    });
  }

  if (executionMetrics) {
    const quality = parsed != null
      ? extractScanQualityMetrics(parsed)
      : extractScanQualityMetrics({ scannedResults: [] });
    await persistScanMetrics(
      requestId,
      buildScanMetricsDocument({
        clubId,
        race: raceSummary,
        requestId,
        uid,
        execution: executionMetrics,
        quality,
      }),
    );
  }

  if (caughtError) {
    throw caughtError;
  }

  return buildCallableScanResponse(parsed as Record<string, unknown>, executionMetrics!);
}

export const parseStoredResultsSheet = onCall({
  memory: "512MiB",
  timeoutSeconds: 300,
}, async (request) => {
  const requestId = randomUUID();

  assertAuthenticated(request.auth, { requestId });

  const { scannerContext, clubId, raceId } = validateStoredRequest(request.data, requestId);
  assertCallerRole("race-officer", request.auth, clubId);

  logScan(requestId, "validate_input", "parseStoredResultsSheet invoked", {
    uid: request.auth.uid,
    clubId,
    raceId,
    storagePath: resultsSheetStoragePath(clubId, raceId),
  });
  return parseFromStoredImage(requestId, clubId, raceId, scannerContext, request.auth.uid);
});
