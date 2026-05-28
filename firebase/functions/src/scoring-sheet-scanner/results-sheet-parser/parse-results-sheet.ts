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
import { parseWithAi } from "./ai-parsing.js";
import { detailedHttpsError } from "../../shared/https-error.js";
import { assertAuthenticated, assertCallerRole } from "../../shared/authorisation.js";

function db() {
  return getFirestore();
}

interface ParseStoredResultsSheetRequest {
  scannerContext: ScannerContext;
  clubId: string;
  raceId: string;
  storagePath: string;
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
): Promise<Array<{ id: string; class: string; sailNumber: string; name?: string }>> {
  logScan(requestId, "build_roster", "Querying race-results for race", { clubId, raceId });

  const compSnap = await db()
    .collection(`clubs/${clubId}/race-results`)
    .where("raceId", "==", raceId)
    .get();

  if (compSnap.empty) {
    logScanError(requestId, "build_roster", "No race-results documents for raceId", {
      clubId,
      raceId,
      cause: "empty_race_results",
    });
    throw detailedHttpsError(
      "not-found",
      "No race competitors found for this race. Add entries or select a different race.",
      { requestId, stage: "build_roster", cause: "empty_race_results", clubId, raceId },
    );
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

  const competitors: Array<{ id: string; class: string; sailNumber: string; name?: string }> = [];
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
    logScanError(requestId, "build_roster", "No roster entries after resolving series entries", {
      clubId,
      raceId,
      cause: "roster_empty_after_resolve",
    });
    throw detailedHttpsError(
      "failed-precondition",
      "Race has competitor rows but none could be resolved to class / sail / helm from series entries.",
      { requestId, stage: "build_roster", cause: "roster_empty_after_resolve", clubId, raceId },
    );
  }

  competitors.sort((a, b) => {
    const c = a.class.localeCompare(b.class);
    if (c !== 0) return c;
    return a.sailNumber.localeCompare(b.sailNumber, undefined, { numeric: true });
  });

  return competitors;
}

export function validateStoredRequest(data: unknown, requestId: string): ParseStoredResultsSheetRequest {
  const requestData = data as ParseStoredResultsSheetRequest;
  const { scannerContext, clubId, raceId, storagePath } = requestData;

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
  if (!storagePath || typeof storagePath !== "string") {
    throw detailedHttpsError("invalid-argument", "Missing storagePath.", {
      requestId,
      stage: "validate_input",
      cause: "missing_storage_path",
    });
  }
  return {
    scannerContext,
    clubId,
    raceId,
    storagePath,
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
    pageNotes: typeof parsed.pageNotes === "string" ? parsed.pageNotes : undefined,
    unreadableRowsCount:
      typeof parsed.unreadableRowsCount === "number" ? parsed.unreadableRowsCount : 0,
  };
}

async function persistScanResponse(
  requestId: string,
  clubId: string,
  raceId: string,
  parsed: Record<string, unknown>,
  storagePath: string,
): Promise<void> {
  const scanResponse = extractScanResponseForPersistence(parsed);
  await db().doc(`clubs/${clubId}/scan-results/${raceId}`).set(
    {
      scanResponse,
      scannedAt: FieldValue.serverTimestamp(),
      requestId,
      storagePath: typeof parsed.storedImagePath === "string" ? parsed.storedImagePath : storagePath,
    },
    { merge: true },
  );
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
  storagePath: string,
) {
  const roster = await getRaceCompetitors(clubId, raceId, requestId);
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  const imageMimeType = metadata.contentType || "image/jpeg";
  const imageBase64 = buffer.toString("base64");

  const mergedContext: ScannerContext = {
    ...scannerContext,
    timeFormat: normalizeScannerTimeFormat(scannerContext.timeFormat),
    roster,
    targetRaces: [raceId, ...(scannerContext.targetRaces ?? [])].filter(
      (id, i, arr) => arr.indexOf(id) === i,
    ),
  };
  logScan(requestId, "merge_scanner_context", "Merged Firestore roster into scanner context", {
    targetRaces: mergedContext.targetRaces,
    lapFormat: mergedContext.lapFormat,
    listOrder: mergedContext.listOrder,
    hasHours: mergedContext.hasHours,
    defaultHour: mergedContext.defaultHour,
    defaultLaps: mergedContext.defaultLaps,
    lapsPresentOnSheet: mergedContext.lapsPresentOnSheet ?? true,
    timeFormat: mergedContext.timeFormat ?? "clock_hms",
    storagePath,
  });

  const parsed = await parseWithAi(requestId, imageBase64, imageMimeType, mergedContext, raceId);
  const response =
    (typeof parsed === "object" && parsed !== null)
      ? { ...(parsed as Record<string, unknown>) }
      : { parsed };
  const withStorage = {
    ...response,
    storedImagePath: storagePath,
    storedImageUri: `gs://${bucket.name}/${storagePath}`,
  };
  await persistScanResponse(requestId, clubId, raceId, withStorage, storagePath);
  return withStorage;
}

export const parseStoredResultsSheet = onCall({
  memory: "512MiB",
  timeoutSeconds: 300,
}, async (request) => {
  const requestId = randomUUID();

  assertAuthenticated(request.auth, { requestId });

  const { scannerContext, clubId, raceId, storagePath } = validateStoredRequest(request.data, requestId);
  assertCallerRole("race-officer", request.auth, clubId);

  logScan(requestId, "validate_input", "parseStoredResultsSheet invoked", {
    uid: request.auth.uid,
    clubId,
    raceId,
    storagePath,
  });
  return parseFromStoredImage(requestId, clubId, raceId, scannerContext, storagePath);
});
