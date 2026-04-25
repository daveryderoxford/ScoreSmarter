import { ApiError, GoogleGenAI, Type, type GenerateContentResponse } from "@google/genai";
import { defaultClassAliases } from "./class-aliases";
import { ScannerContext, httpsWithDetails, logScan, logScanError } from "./types";

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

const NORMALIZED_TIME_REGEX = /^\d{2}:\d{2}:\d{2}$/;

function validateNormalizedTimes(parsed: unknown, requestId: string): void {
  if (typeof parsed !== "object" || parsed === null) {
    throw httpsWithDetails("internal", "Model response is not an object.", {
      requestId,
      stage: "parse_model_json",
      cause: "invalid_model_shape",
    });
  }
  const scannedResults = (parsed as { scannedResults?: unknown }).scannedResults;
  if (!Array.isArray(scannedResults)) {
    throw httpsWithDetails("internal", "Model response missing scannedResults array.", {
      requestId,
      stage: "parse_model_json",
      cause: "missing_scanned_results",
    });
  }

  for (const row of scannedResults) {
    if (typeof row !== "object" || row === null) continue;
    const rowObj = row as {
      rowIndex?: unknown;
      status?: unknown;
      time?: { value?: unknown };
    };
    const status = typeof rowObj.status === "string" ? rowObj.status.toUpperCase() : "OK";
    const timeValue = typeof rowObj.time?.value === "string" ? rowObj.time.value : "";
    if (status === "OK" && !NORMALIZED_TIME_REGEX.test(timeValue)) {
      throw httpsWithDetails(
        "internal",
        "Model returned invalid time format. Expected HH:mm:ss for finish rows.",
        {
          requestId,
          stage: "parse_model_json",
          cause: "invalid_time_format",
          rowIndex: rowObj.rowIndex,
          status,
          timeValue,
        },
      );
    }
  }
}

export async function parseWithAi(
  requestId: string,
  imageBase64: string,
  imageMimeType: string,
  mergedContext: ScannerContext,
  raceId: string,
): Promise<unknown> {
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
    validateNormalizedTimes(parsed, requestId);
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
}

export function buildPrompt(ctx: ScannerContext, raceId: string): string {
  const aliasesStr = ctx.classAliases ? JSON.stringify(ctx.classAliases) : JSON.stringify(defaultClassAliases);

  const rosterStr = ctx.roster && ctx.roster.length > 0
    ? JSON.stringify(ctx.roster)
    : "No roster provided";

  const targetRacesStr = ctx.targetRaces?.length
    ? JSON.stringify(ctx.targetRaces)
    : JSON.stringify([raceId]);

  const lapsPresent = ctx.lapsPresentOnSheet !== false;
  const timeFormat = ctx.timeFormat ?? "hours_minutes_seconds";

  const lapRules = lapsPresent
    ? `4. LAP COLUMN PRESENT — LAP FORMATTING:
  Lap Format specified by user: ${ctx.lapFormat}
  Default Laps if none written in a row: ${ctx.defaultLaps ?? "Unknown"}
  If the format is 'ticks', lap numbers might be vertical tally marks (e.g., ||| = 3) or checkmarks (VV = 2). If both tallies and a final number are present, use the final number. Otherwise, count the marks and translate to an integer.
  Read lap counts from the sheet where shown; use Default Laps when a row has no lap value visible.`
    : `4. NO LAP COLUMN ON THIS SHEET:
  The race officer did not record laps on this sheet. Do not infer a lap column from stray marks.
  For every competitor row, set laps.value to the Default Laps value below (${ctx.defaultLaps ?? "use best guess from context"}) unless the sheet explicitly states a different lap count for that row. Set laps.confidence to HIGH if you apply the default consistently.
  Lap Format (${ctx.lapFormat}) does not apply to a missing column; ignore tick/number lap rules.`;

  const timeRules = timeFormat === "minutes_seconds_only"
    ? `5. TIME FORMAT — MINUTES AND SECONDS ONLY (NO HOURS WRITTEN):
  The officer typically wrote only elapsed minutes and seconds (e.g. "45:30" means 45 minutes 30 seconds, NOT 45 hours).
  Treat two-part times as MM:SS (minutes:seconds). If you see three parts (A:B:C), the leftmost group may still be minutes if that matches the sheet style — prefer MM:SS interpretation when it matches other rows.
  Do NOT prepend Default Hour to two-part times; Default Hour and "hours on sheet" do not apply to this format.
  Output time.value as a string using two components for sub-hour elapsed, e.g. "45:30" or normalize to "45:30.000" if needed; never mis-read MM:SS as HH:MM unless the sheet clearly labels clock times.
  Validate that minutes and seconds are in range (seconds 0–59). Provide alternatives if ambiguous.`
    : `5. TIME FORMAT — HOURS : MINUTES : SECONDS (CLOCK OR FULL ELAPSED):
  The times are recorded as hours, minutes and seconds.
  Default Hour (if hour part missing): ${ctx.defaultHour !== undefined ? ctx.defaultHour : "None provided"}
  When the hour part is missing and Default Hour is provided, prepend it and express as HH:MM:SS.
  When hours appear on the sheet, read as full clock-style or elapsed with hours as appropriate. Validate that the time looks mathematically correct. Provide alternative values if ambiguous.`;

  return `
You are reading a handwritten race results sheet for sailing. You must follow these strict rules to maximize accuracy and provide structured output.

--- CONTEXT:
- Target race id: ${raceId}
- Target races list (may include duplicates filtered on server): ${targetRacesStr}
- This roster was loaded from Firestore for that race. Each id is a race-results document id; set matchedCompetitorId to that id when you match a row to that competitor.
- Sheet includes a lap column: ${lapsPresent ? "Yes" : "No"}
- Time interpretation mode: ${timeFormat === "minutes_seconds_only" ? "Minutes and seconds only (elapsed MM:SS, no hours written)" : "Hours, minutes and seconds (clock / full H:M:S)"}

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

${lapRules}

${timeRules}

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

9. OUTPUT TIME NORMALIZATION (REQUIRED):
   For rows with status "OK", output time.value strictly as HH:mm:ss in 24-hour format with leading zeros.
   Examples: "09:05:07", "14:23:10".
   For non-finish/status rows (DNS, DNF, RET, DSQ, etc.), set time.value to an empty string.
   Do not return milliseconds, AM/PM, words, or other separators.

Respond strictly with the requested JSON schema. Do not include markdown blocks like \`\`\`json around the response, output just raw JSON.
`;
}
