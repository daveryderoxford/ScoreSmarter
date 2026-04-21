import { randomUUID } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ApiError, GoogleGenAI, Type, type GenerateContentResponse } from "@google/genai";
import { getFirestore } from "firebase-admin/firestore";
import { defaultClassAliases } from "./class-aliases";

const LOG = "parseResultsSheet";

/** Stages for logs and HttpsError.details.stage (client-visible). */
type ScanStage =
   | "validate_input"
   | "assert_club_access"
   | "build_roster"
   | "merge_scanner_context"
   | "build_prompt"
   | "vertex_generate"
   | "parse_model_json";

interface ScanErrorDetails {
   requestId: string;
   stage: ScanStage;
   /** Short machine-readable hint (safe for logs / UI). */
   cause?: string;
   [key: string]: unknown;
}

const db = getFirestore();

const GCP_PROJECT = process.env.GCLOUD_PROJECT || "sailbrowser-efef0";

/**
 * Vertex **Generative AI API** location for @google/genai (not the same as the Cloud Functions region).
 * Gemini 3.1 Pro preview is only available on the **global** endpoint (see Vertex model + Gemini 3 docs).
 */
const VERTEX_GENAI_LOCATION = "global";

/** Gemini 3.1 Pro (Vertex public preview); call only with `VERTEX_GENAI_LOCATION` "global". */
const GEMINI_MODEL = "gemini-3.1-pro-preview";

const genai = new GoogleGenAI({
   vertexai: true,
   project: GCP_PROJECT,
   location: VERTEX_GENAI_LOCATION,
});

/** Structured output schema for @google/genai (OpenAPI-style; replaces VertexAI SchemaType). */
const SCAN_RESULT_RESPONSE_SCHEMA = {
   type: Type.OBJECT,
   properties: {
      scannedResults: {
         type: Type.ARRAY,
         items: {
            type: Type.OBJECT,
            properties: {
               rowIndex: { type: Type.INTEGER },
               boatClass: {
                  type: Type.OBJECT,
                  properties: {
                     value: { type: Type.STRING },
                     confidence: { type: Type.STRING },
                     alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
               },
               sailNumber: {
                  type: Type.OBJECT,
                  properties: {
                     value: { type: Type.STRING },
                     confidence: { type: Type.STRING },
                     alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
               },
               competitorName: {
                  type: Type.OBJECT,
                  properties: {
                     value: { type: Type.STRING },
                     confidence: { type: Type.STRING },
                     alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
               },
               time: {
                  type: Type.OBJECT,
                  properties: {
                     value: { type: Type.STRING },
                     confidence: { type: Type.STRING },
                     alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
               },
               laps: {
                  type: Type.OBJECT,
                  properties: {
                     value: { type: Type.NUMBER },
                     confidence: { type: Type.STRING },
                     alternatives: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  },
               },
               status: {
                  type: Type.STRING,
                  description: "Standard sailing status codes, e.g. OK, RET, DNS, DNF, DSQ",
               },
               overallRowConfidence: {
                  type: Type.STRING,
                  description: "HIGH, MANUAL_CHECK, FAILED, or AMBIGUOUS",
               },
               matchedCompetitorId: { type: Type.STRING },
            },
            required: ["rowIndex", "boatClass", "sailNumber", "time", "laps", "status", "overallRowConfidence"],
         },
      },
      pageNotes: { type: Type.STRING },
      unreadableRowsCount: { type: Type.INTEGER },
   },
   required: ["scannedResults", "unreadableRowsCount"],
};

interface SeriesEntryDoc {
   helm?: string;
   boatClass?: string;
   sailNumber?: number;
}

interface RaceCompetitorDoc {
   seriesEntryId?: string;
   raceId?: string;
}

// Interface to type the context being passed in
interface ScannerContext {
   targetRaces: string[];
   lapFormat: "numbers" | "ticks";
   defaultLaps?: number;
   hasHours: boolean;
   defaultHour?: number;
   listOrder: "chronological" | "firstLap" | "unsorted";
   classAliases?: Record<string, string>;
   roster: Array<{ class: string; sailNumber: string; name?: string; id: string }>;
}

function logScan(requestId: string, stage: ScanStage, message: string, data?: Record<string, unknown>): void {
   const payload = { requestId, stage, ...data };
   console.log(JSON.stringify({ severity: "INFO", log: LOG, message, ...payload }));
}

function logScanError(requestId: string, stage: ScanStage, message: string, data?: Record<string, unknown>): void {
   const payload = { requestId, stage, ...data };
   console.error(JSON.stringify({ severity: "ERROR", log: LOG, message, ...payload }));
}

function httpsWithDetails(
   code: "invalid-argument" | "permission-denied" | "unauthenticated" | "not-found" | "failed-precondition" | "internal",
   message: string,
   details: ScanErrorDetails,
): HttpsError {
   return new HttpsError(code, message, details);
}

function assertCallerHasClubAccess(
   authToken: Record<string, unknown>,
   clubId: string,
   requestId: string,
): void {
 /*  if (authToken["sysAdmin"] === true) {
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

   logScan(requestId, "build_roster", "Loaded race-results rows", {
      clubId,
      raceId,
      raceResultDocCount: compSnap.size,
   });

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

   logScan(requestId, "build_roster", "Resolved series-entries", {
      uniqueSeriesEntryIds: entryIds.length,
      entriesFound: entryById.size,
   });

   const roster: Array<{ id: string; class: string; sailNumber: string; name?: string }> = [];

   for (const doc of compSnap.docs) {
      const comp = doc.data() as RaceCompetitorDoc;
      const sid = comp.seriesEntryId;
      if (!sid) {
         logScan(requestId, "build_roster", "Skipping race-result row without seriesEntryId", {
            raceResultId: doc.id,
         });
         continue;
      }
      const entry = entryById.get(sid);
      if (!entry) {
         logScan(requestId, "build_roster", "Missing series entry for competitor row", {
            raceResultId: doc.id,
            seriesEntryId: sid,
         });
         continue;
      }
      const boatClass = (entry.boatClass ?? "").trim();
      const helm = (entry.helm ?? "").trim();
      const sailNum = entry.sailNumber;
      if (!boatClass || sailNum == null || Number.isNaN(Number(sailNum))) {
         logScan(requestId, "build_roster", "Skipping row with incomplete entry fields", {
            raceResultId: doc.id,
            seriesEntryId: sid,
         });
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

   logScan(requestId, "build_roster", "Roster ready for AI prompt", { rosterSize: roster.length });
   return roster;
}

export const parseResultsSheet = onCall({
   memory: "512MiB",     // Use "MiB" for Firebase v2 TypeScript types
   timeoutSeconds: 300,  //  5 minutes
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
   const data = request.data;

   const {
      imageBase64,
      imageMimeType = "image/jpeg",
      scannerContext,
      clubId,
      raceId,
   } = data as {
      imageBase64: string;
      imageMimeType?: string;
      scannerContext: ScannerContext;
      clubId: string;
      raceId: string;
   };

   logScan(requestId, "validate_input", "parseResultsSheet invoked", {
      uid,
      clubId: typeof clubId === "string" ? clubId : undefined,
      raceId: typeof raceId === "string" ? raceId : undefined,
      imageMimeType,
      imageBase64Length: typeof imageBase64 === "string" ? imageBase64.length : 0,
      hasScannerContext: !!scannerContext,
   });

   if (!imageBase64) {
      logScanError(requestId, "validate_input", "Missing imageBase64");
      throw httpsWithDetails("invalid-argument", "Missing image base64 data.", {
         requestId,
         stage: "validate_input",
         cause: "missing_image",
      });
   }
   if (!scannerContext) {
      logScanError(requestId, "validate_input", "Missing scannerContext");
      throw httpsWithDetails("invalid-argument", "Missing scanner context.", {
         requestId,
         stage: "validate_input",
         cause: "missing_context",
      });
   }
   if (!clubId || typeof clubId !== "string") {
      logScanError(requestId, "validate_input", "Missing clubId");
      throw httpsWithDetails("invalid-argument", "Missing clubId.", {
         requestId,
         stage: "validate_input",
         cause: "missing_club_id",
      });
   }
   if (!raceId || typeof raceId !== "string") {
      logScanError(requestId, "validate_input", "Missing raceId");
      throw httpsWithDetails("invalid-argument", "Missing raceId.", {
         requestId,
         stage: "validate_input",
         cause: "missing_race_id",
      });
   }

   assertCallerHasClubAccess(request.auth.token as Record<string, unknown>, clubId, requestId);

   const roster = await buildRosterFromRace(clubId, raceId, requestId);

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
   });

   let prompt: string;
   try {
      prompt = buildPrompt(mergedContext, raceId);
   } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logScanError(requestId, "build_prompt", msg, { cause: "build_prompt_failed" });
      throw httpsWithDetails("internal", "Failed to build AI prompt.", {
         requestId,
         stage: "build_prompt",
         cause: "build_prompt_failed",
         clubId,
         raceId,
      });
   }

   const promptPreviewMax = 800;
   logScan(requestId, "build_prompt", "Built text prompt for Gemini via Vertex (image sent separately)", {
      model: GEMINI_MODEL,
      project: GCP_PROJECT,
      location: VERTEX_GENAI_LOCATION,
      promptCharLength: prompt.length,
      promptPreview: prompt.slice(0, promptPreviewMax),
      promptTruncated: prompt.length > promptPreviewMax,
   });

   let result: GenerateContentResponse;
   try {
      result = await genai.models.generateContent({
         model: GEMINI_MODEL,
         contents: [
            {
               role: "user",
               parts: [
                  {
                     inlineData: {
                        mimeType: imageMimeType,
                        data: imageBase64,
                     },
                  },
                  { text: prompt },
               ],
            },
         ],
         config: {
            responseMimeType: "application/json",
            responseSchema: SCAN_RESULT_RESPONSE_SCHEMA,
         },
      });
   } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = e instanceof ApiError ? e.status : undefined;
      logScanError(requestId, "vertex_generate", `Gemini generateContent failed: ${msg}`, {
         cause: "vertex_error",
         model: GEMINI_MODEL,
         httpStatus: status,
      });
      throw httpsWithDetails(
         "internal",
         `AI request failed (${msg}). Check logs for requestId.`,
         {
            requestId,
            stage: "vertex_generate",
            cause: "vertex_error",
            model: GEMINI_MODEL,
            vertexMessage: msg.slice(0, 500),
            httpStatus: status,
         },
      );
   }

   const candidate = result.candidates?.[0];
   const finishReason = candidate?.finishReason;
   const safetyRatings = candidate?.safetyRatings;

   logScan(requestId, "vertex_generate", "Gemini response received", {
      candidateCount: result.candidates?.length ?? 0,
      finishReason,
      safetyRatingsCount: safetyRatings?.length ?? 0,
   });

   const resultJson = result.text ?? candidate?.content?.parts?.find((p) => p.text)?.text;
   if (!resultJson) {
      logScanError(requestId, "vertex_generate", "No text part in Gemini response", {
         cause: "empty_model_text",
         finishReason,
      });
      throw httpsWithDetails(
         "internal",
         "No text returned from Gemini (empty or blocked response). Check logs for requestId.",
         {
            requestId,
            stage: "vertex_generate",
            cause: "empty_model_text",
            finishReason: finishReason ?? "UNKNOWN",
         },
      );
   }

   const jsonPreviewMax = 400;
   logScan(requestId, "parse_model_json", "Model returned JSON string", {
      resultJsonLength: resultJson.length,
      resultJsonPreview: resultJson.slice(0, jsonPreviewMax),
      resultJsonTruncated: resultJson.length > jsonPreviewMax,
   });

   try {
      const parsed = JSON.parse(resultJson) as unknown;
      logScan(requestId, "parse_model_json", "Successfully parsed model JSON", {
         hasScannedResults: typeof parsed === "object" && parsed !== null && "scannedResults" in parsed,
      });
      return parsed;
   } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logScanError(requestId, "parse_model_json", `JSON.parse failed: ${msg}`, {
         cause: "json_parse_failed",
         resultJsonHead: resultJson.slice(0, 200),
      });
      throw httpsWithDetails(
         "internal",
         "Model returned invalid JSON. Check logs for requestId.",
         {
            requestId,
            stage: "parse_model_json",
            cause: "json_parse_failed",
            parseError: msg.slice(0, 300),
         },
      );
   }
});

function buildPrompt(ctx: ScannerContext, raceId: string): string {
   const aliasesStr = ctx.classAliases ? JSON.stringify(ctx.classAliases) : JSON.stringify(defaultClassAliases);

   const rosterStr = ctx.roster && ctx.roster.length > 0
      ? JSON.stringify(ctx.roster)
      : "No roster provided";

   const targetRacesStr = ctx.targetRaces?.length
      ? JSON.stringify(ctx.targetRaces)
      : JSON.stringify([raceId]);

   return `
You are reading a handwritten race results sheet for sailing. You must follow these strict rules to maximize accuracy and provide structured output.

--- CONTEXT:
- Target race id (Firestore): ${raceId}
- Target races list (may include duplicates filtered on server): ${targetRacesStr}
- This roster was loaded from Firestore for that race. Each id is a race-results document id; set matchedCompetitorId to that id when you match a row to that competitor.

--- RULES:
1. THE ROSTER MUST BE USED TO CORRECT MISTAKES:
   Expected Competitor Roster: ${rosterStr}
   When reading a class and sail number, compare it to the roster. If the handwritten text is messy (e.g., '1234S' instead of '12345'), but the roster contains '12345' in that class, confidently correct it to '12345' and mark it HIGH confidence, setting 'matchedCompetitorId' to the found id.

2. CLASS ALIASES:
   Class Aliases provided: ${aliasesStr}
   If you see a shorthand class name (e.g., 'A9', 'LR'), check the aliases and output the mapped, correct value (e.g., 'Aero 9', 'ILCA 6').

3. STATUS CODES & CROSSED-OUT ROWS:
   - Check the time column for standard sailing status codes (DNS, RET, DNF, DSQ, etc.). If you see one, set the 'time.value' to null and update the 'status' field.
   - Ignore any data that has a distinct horizontal line drawn through it or is heavily scribbled out. If a whole row is struck through, ignore it or output it with a status of 'STRUCK_THROUGH' (in 'status') or 'FAILED' confidence. If a time is crossed out but a new one is written next to it, take the new one.

4. LAP FORMATTING:
   Lap Format specified by user: ${ctx.lapFormat}
   Default Laps if none written: ${ctx.defaultLaps || "Unknown"}
   If the format is 'ticks', lap numbers might be vertical tally marks (e.g., ||| = 3) or checkmarks (VV = 2). If both tallies and a final number are present, use the final number. Otherwise, count the marks and translate to an integer.

5. TIME VALIDATION:
   Hours expected on sheet?: ${ctx.hasHours ? "Yes" : "No"}
   Default Hour (if missing): ${ctx.defaultHour !== undefined ? ctx.defaultHour : "None provided"}
   If hours are missing, prepend the Default Hour (if provided) and format as HH:MM:SS. Validate that the time looks mathematically correct. Check all time fields for colons or periods separating blocks. Provide alternative values if ambiguous.

6. ORDER EXPECTATION:
   List Order Expectation: ${ctx.listOrder}
   - Chronological: Times should generally strictly increase as you read down.
   - firstLap: Times will generally increase, but overtakes/lapses mean the order is only approximate.  This may be especially the case if competitors do different number of laps
   - unsorted: Evaluate each row individually.
   Use this expectation to catch OCR errors. If a row breaks the expected sequence drastically and looks like a misread (e.g., 14:26:00 followed by 14:21:00), flag it as 'MANUAL_CHECK' and/or provide alternatives.

7. CONFIDENCE RATINGS:
   You must assign one of the following confidence levels to each extracted value AND the row overall:
   - HIGH: You are certain of the read, especially if it matches the Roster exactly.
   - MANUAL_CHECK: The handwriting is somewhat unclear, or you corrected a typo, or the time is out of sequence.
   - FAILED / AMBIGUOUS: It is not readable or decipherable. Only output alternatives if you have a guess. Output 'FAILED' if it's completely unreadable scribbles.

8. PAGE NOTES:
   If there is a large note spanning multiple rows or columns (e.g., "RACE ABANDONED due to gusts"), extract it entirely into the 'pageNotes' root field on the JSON object, do not force it into competitor rows.

Respond strictly with the requested JSON schema. Do not include markdown blocks like \`\`\`json around the response, output just raw JSON.
`;
}
