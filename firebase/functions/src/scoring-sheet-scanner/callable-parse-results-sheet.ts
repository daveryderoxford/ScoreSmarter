import { randomUUID } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import {
  ParseResultsSheetRequest,
  RaceCompetitorDoc,
  ScannerContext,
  SeriesEntryDoc,
  httpsWithDetails,
  logScan,
  logScanError,
} from "./types";
import { storeResultsSheetImage, updateRaceResultsSheetImagePath } from "./image-storage";
import { parseWithAi } from "./ai-parsing";

const db = getFirestore();

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

  const compSnap = await db
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

  const entryRefs = entryIds.map((id) => db.doc(`clubs/${clubId}/series-entries/${id}`));
  const entrySnaps = entryRefs.length > 0 ? await db.getAll(...entryRefs) : [];

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

export function validateRequest(data: unknown, requestId: string): ParseResultsSheetRequest {
  const requestData = data as ParseResultsSheetRequest;
  const {
    imageBase64,
    imageMimeType = "image/jpeg",
    scannerContext,
    clubId,
    raceId,
  } = requestData;

  if (!imageBase64 || typeof imageBase64 !== "string") {
    throw httpsWithDetails("invalid-argument", "Missing image base64 data.", {
      requestId,
      stage: "validate_input",
      cause: "missing_image",
    });
  }
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

  return {
    imageBase64,
    imageMimeType,
    scannerContext,
    clubId,
    raceId,
  };
}

export const parseResultsSheet = onCall({
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

  const uid = request.auth.uid;
  const { imageBase64, imageMimeType, scannerContext, clubId, raceId } = validateRequest(request.data, requestId);

  logScan(requestId, "validate_input", "parseResultsSheet invoked", {
    uid,
    clubId,
    raceId,
    imageMimeType,
    imageBase64Length: imageBase64.length,
    hasScannerContext: !!scannerContext,
  });

  assertCallerHasClubAccess(request.auth.token as Record<string, unknown>, clubId, requestId);
  const roster = await buildRosterFromRace(clubId, raceId, requestId);

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(imageBase64, "base64");
  } catch (_e) {
    throw httpsWithDetails("invalid-argument", "imageBase64 is not valid base64.", {
      requestId,
      stage: "validate_input",
      cause: "invalid_base64",
    });
  }

  const { storagePath, gsUri } = await storeResultsSheetImage(
    clubId,
    raceId,
    imageBuffer,
    imageMimeType,
    requestId,
  );
  await updateRaceResultsSheetImagePath(clubId, raceId, storagePath, requestId);

  const mergedContext: ScannerContext = {
    ...scannerContext,
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
    timeFormat: mergedContext.timeFormat ?? "hours_minutes_seconds",
  });

  const parsed = await parseWithAi(requestId, imageBase64, imageMimeType, mergedContext, raceId);

  return {
    ...((typeof parsed === "object" && parsed !== null) ? parsed as Record<string, unknown> : { parsed }),
    storedImagePath: storagePath,
    storedImageUri: gsUri,
  };
});
