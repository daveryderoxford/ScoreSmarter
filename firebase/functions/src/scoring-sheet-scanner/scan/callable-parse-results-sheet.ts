import { randomUUID } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall } from "firebase-functions/v2/https";
import {
  RaceCompetitorDoc,
  ScannerContext,
  ScannerTimeFormat,
  SeriesEntryDoc,
  httpsWithDetails,
  logScan,
  logScanError,
} from "../ai-scan-types.js";
import {
  raceCalendarDocPath,
} from "../image-upload/image-storage.js";
import { parseWithAi } from "./ai-parsing.js";

function db() {
  return getFirestore();
}

interface ParseStoredResultsSheetRequest {
  scannerContext: ScannerContext;
  clubId: string;
  raceId: string;
  storagePath?: string;
}

function normalizeScannerTimeFormat(value: unknown): ScannerTimeFormat {
  if (value === "clock_hms" || value === "stopwatch_hms_elapsed" || value === "stopwatch_ms_elapsed") {
    return value;
  }
  return "clock_hms";
}

function assertCallerHasClubAccess(
  authToken: Record<string, unknown>,
  clubId: string,
  requestId: string,
): void {
/*  
if (authToken["sysAdmin"] === true) {
    return;
  }
  const clubs = authToken["clubs"] as Record<string, string> | undefined;
  if (clubs && typeof clubs[clubId] === "string" && clubs[clubId].length > 0) {
    return;
  }
  logScanError(requestId, "assert_club_access", "Club access denied", { clubId });
  throw httpsWithDetails("permission-denied", "You do not have access to load competitors for this club.", {
    requestId,
    stage: "assert_club_access",
    cause: "club_claim_missing",
    clubId,
  }); */
  // TODO temp allow to run without club auth token.
  return;
}

async function buildRosterFromRace(
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
    throw httpsWithDetails(
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
      entryById.set(snap.id, snap.data() as SeriesEntryDoc);
    }
  }

  const roster: Array<{ id: string; class: string; sailNumber: string; name?: string }> = [];
  for (const doc of compSnap.docs) {
    const comp = doc.data() as RaceCompetitorDoc;
    const sid = comp.seriesEntryId;
    if (!sid) continue;

    const entry = entryById.get(sid);
    if (!entry) continue;

    const boatClass = (entry.boatClass ?? "").trim();
    const helm = (entry.helm ?? "").trim();
    const sailNum = entry.sailNumber;
    if (!boatClass || sailNum == null || Number.isNaN(Number(sailNum))) {
      continue;
    }
    roster.push({
      id: doc.id,
      class: boatClass,
      sailNumber: String(sailNum),
      name: helm || undefined,
    });
  }

  if (roster.length === 0) {
    logScanError(requestId, "build_roster", "No roster entries after resolving series entries", {
      clubId,
      raceId,
      cause: "roster_empty_after_resolve",
    });
    throw httpsWithDetails(
      "failed-precondition",
      "Race has competitor rows but none could be resolved to class / sail / helm from series entries.",
      { requestId, stage: "build_roster", cause: "roster_empty_after_resolve", clubId, raceId },
    );
  }

  roster.sort((a, b) => {
    const c = a.class.localeCompare(b.class);
    if (c !== 0) return c;
    return a.sailNumber.localeCompare(b.sailNumber, undefined, { numeric: true });
  });

  return roster;
}

export function validateStoredRequest(data: unknown, requestId: string): ParseStoredResultsSheetRequest {
  const requestData = data as ParseStoredResultsSheetRequest;
  const { scannerContext, clubId, raceId, storagePath } = requestData;

  if (!scannerContext) {
    throw httpsWithDetails("invalid-argument", "Missing scanner context.", {
      requestId,
      stage: "validate_input",
      cause: "missing_context",
    });
  }
  if (!clubId || typeof clubId !== "string") {
    throw httpsWithDetails("invalid-argument", "Missing clubId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_club_id",
    });
  }
  if (!raceId || typeof raceId !== "string") {
    throw httpsWithDetails("invalid-argument", "Missing raceId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_race_id",
    });
  }
  if (storagePath != null && typeof storagePath !== "string") {
    throw httpsWithDetails("invalid-argument", "storagePath must be a string when provided.", {
      requestId,
      stage: "validate_input",
      cause: "invalid_storage_path_type",
    });
  }
  return {
    scannerContext,
    clubId,
    raceId,
    storagePath,
  };
}

async function resolveStoragePath(clubId: string, raceId: string, requestId: string): Promise<string> {
  const raceSnap = await db().doc(raceCalendarDocPath(clubId, raceId)).get();
  const path = raceSnap.get("resultsSheetImage");
  if (typeof path === "string" && path.length > 0) {
    return path;
  }
  throw httpsWithDetails("not-found", "No stored results sheet image found for race.", {
    requestId,
    stage: "validate_input",
    cause: "missing_stored_image_path",
    clubId,
    raceId,
  });
}

async function parseFromStoredImage(
  requestId: string,
  clubId: string,
  raceId: string,
  scannerContext: ScannerContext,
  storagePath: string,
) {
  const roster = await buildRosterFromRace(clubId, raceId, requestId);
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
  return {
    ...((typeof parsed === "object" && parsed !== null) ? parsed as Record<string, unknown> : { parsed }),
    storedImagePath: storagePath,
    storedImageUri: `gs://${bucket.name}/${storagePath}`,
  };
}

export const parseStoredResultsSheet = onCall({
  memory: "512MiB",
  timeoutSeconds: 300,
}, async (request) => {
  const requestId = randomUUID();

  if (!request.auth) {
    logScanError(requestId, "validate_input", "Unauthenticated call");
    throw httpsWithDetails("unauthenticated", "Only authenticated users can scan results sheets.", {
      requestId,
      stage: "validate_input",
      cause: "no_auth",
    });
  }

  const { scannerContext, clubId, raceId, storagePath } = validateStoredRequest(request.data, requestId);
  assertCallerHasClubAccess(request.auth.token as Record<string, unknown>, clubId, requestId);

  const resolvedStoragePath = storagePath || await resolveStoragePath(clubId, raceId, requestId);
  logScan(requestId, "validate_input", "parseStoredResultsSheet invoked", {
    uid: request.auth.uid,
    clubId,
    raceId,
    storagePath: resolvedStoragePath,
  });
  return parseFromStoredImage(requestId, clubId, raceId, scannerContext, resolvedStoragePath);
});
