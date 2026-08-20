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
  resolveScanModelParams,
} from "../ai-scan-model.js";
import { mergeClassAliases } from "./class-aliases.js";
import { fleetNameMapFromClubData } from "./fleet-class-name.js";
import { AIParser, type ScanPromptCapture } from "./ai-parser.js";
import { resultsSheetStoragePath } from "../image-upload/image-storage.js";
import { detailedHttpsError } from "../../shared/https-error.js";
import {
  assertAuthenticated,
  assertCallerRole,
  callerClaims,
  isSysAdmin,
} from "../../shared/authorisation.js";
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

interface RaceScanMetadata extends ScanRaceSummary {
  fleetId?: string;
}

function toScanRaceSummary(meta: RaceScanMetadata): ScanRaceSummary {
  return {
    raceId: meta.raceId,
    ...(meta.seriesName ? { seriesName: meta.seriesName } : {}),
    ...(typeof meta.raceNumber === "number" ? { raceNumber: meta.raceNumber } : {}),
    ...(meta.scheduledStart ? { scheduledStart: meta.scheduledStart } : {}),
  };
}

async function loadRaceSummary(clubId: string, raceId: string): Promise<RaceScanMetadata> {
  const summary: RaceScanMetadata = { raceId };
  try {
    const snap = await db().doc(`clubs/${clubId}/races/${raceId}`).get();
    if (!snap.exists) return summary;
    const data = snap.data() ?? {};
    if (typeof data["seriesName"] === "string") summary.seriesName = data["seriesName"];
    if (typeof data["index"] === "number") summary.raceNumber = data["index"];
    if (typeof data["fleetId"] === "string" && data["fleetId"]) summary.fleetId = data["fleetId"];
    const scheduledStart = data["scheduledStart"];
    if (scheduledStart && typeof scheduledStart.toDate === "function") {
      summary.scheduledStart = scheduledStart;
    }
  } catch {
    // Race metadata is optional for metrics persistence.
  }
  return summary;
}

async function loadClubFleetNames(clubId: string): Promise<Map<string, string>> {
  try {
    const snap = await db().doc(`clubs/${clubId}`).get();
    return fleetNameMapFromClubData(snap.data()?.["fleets"]);
  } catch {
    return new Map();
  }
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
  /** Persist full AI prompt on metrics doc (sys-admin debug only). */
  debugPrompt = false,
) {
  const parseStartMs = Date.now();
  const storagePath = resultsSheetStoragePath(clubId, raceId);
  const modelParams = resolveScanModelParams(
    scannerContext.model,
    scannerContext.thinkingLevel,
  );
  const raceSummary = await loadRaceSummary(clubId, raceId);
  const tokenCapture = emptyTokenCapture();
  const promptCapture: ScanPromptCapture | undefined = debugPrompt
    ? { prompt: null }
    : undefined;
  let parsed: unknown = null;
  let executionMetrics: ScanExecutionMetrics | undefined;
  let caughtError: unknown;

  try {
    const clientRaceIds = (scannerContext.races ?? []).map((r) => r.id);
    const targetRaceIds = [raceId, ...clientRaceIds].filter(
      (id, i, arr) => arr.indexOf(id) === i,
    );
    const scanMode = scannerContext.scanMode === "levelRating" ? "levelRating" : "handicap";
    const fleetNames = await loadClubFleetNames(clubId);

    const races = await Promise.all(
      targetRaceIds.map(async (id) => {
        const [comps, summary] = await Promise.all([
          getRaceCompetitors(clubId, id, requestId),
          loadRaceSummary(clubId, id),
        ]);
        const fleetClassName = summary.fleetId ? fleetNames.get(summary.fleetId) : undefined;
        return {
          id: summary.raceId,
          seriesName: summary.seriesName,
          raceNumber: summary.raceNumber,
          scheduledStartIso: summary.scheduledStart?.toDate?.()?.toISOString(),
          entries: comps,
          ...(fleetClassName ? { fleetClassName } : {}),
        };
      }),
    );

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
      scanMode,
      timeFormat: normalizeScannerTimeFormat(scannerContext.timeFormat),
      classAliases: mergeClassAliases(scannerContext.classAliases),
      races,
    };
    logScan(requestId, "merge_scanner_context", "Merged Firestore races into scanner context", {
      raceIds: races.map((r) => r.id),
      entryCounts: Object.fromEntries(races.map((r) => [r.id, r.entries.length])),
      fleetClassNames: Object.fromEntries(races.map((r) => [r.id, r.fleetClassName ?? ""])),
      scanMode,
      listOrder: mergedContext.listOrder,
      defaultHour: mergedContext.defaultHour,
      defaultLaps: mergedContext.defaultLaps,
      lapsPresentOnSheet: mergedContext.lapsPresentOnSheet ?? true,
      timeFormat: mergedContext.timeFormat ?? "clock_hms",
      storagePath,
    });

    logScan(requestId, "merge_scanner_context", "Resolved AI model for parser", {
      model: modelParams.model,
      thinkingLevel: modelParams.thinkingLevel ?? null,
      location: modelParams.location,
    });

    parsed = await AIParser(
      modelParams,
      requestId,
      imageBase64,
      imageMimeType,
      mergedContext,
      raceId,
      tokenCapture,
      promptCapture,
    );

    if (parsed !== null) {
      await persistScanResponse(requestId, clubId, raceId, parsed);
    }

    executionMetrics = buildExecutionMetrics({
      success: true,
      model: modelParams.model,
      thinkingLevel: modelParams.thinkingLevel,
      location: modelParams.location,
      requestId,
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
      model: modelParams.model,
      thinkingLevel: modelParams.thinkingLevel,
      location: modelParams.location,
      requestId,
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
    const aiPrompt = promptCapture?.prompt?.trim()
      ? promptCapture.prompt
      : undefined;
    await persistScanMetrics(
      requestId,
      buildScanMetricsDocument({
        clubId,
        race: toScanRaceSummary(raceSummary),
        requestId,
        uid,
        execution: executionMetrics,
        quality,
        ...(aiPrompt ? { aiPrompt } : {}),
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

  const debugPrompt =
    !!scannerContext.debug && isSysAdmin(callerClaims(request.auth));
  if (scannerContext.debug && !debugPrompt) {
    logScan(requestId, "validate_input", "Ignoring debug flag — caller is not sys-admin", {
      uid: request.auth.uid,
      clubId,
    });
  }

  logScan(requestId, "validate_input", "parseStoredResultsSheet invoked", {
    uid: request.auth.uid,
    clubId,
    raceId,
    debugPrompt,
    storagePath: resultsSheetStoragePath(clubId, raceId),
  });
  return parseFromStoredImage(
    requestId,
    clubId,
    raceId,
    scannerContext,
    request.auth.uid,
    debugPrompt,
  );
});
