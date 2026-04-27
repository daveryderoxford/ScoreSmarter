import { ApiError, GoogleGenAI, Type, type GenerateContentResponse } from "@google/genai";
import { ScannerContext, ScannerTimeFormat, httpsWithDetails, logScan, logScanError } from "./ai-scan-types.js";
import { buildPrompt } from "./prompt-builder.js";

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

function timeValueSchemaForMode(timeFormat: ScannerTimeFormat) {
  if (timeFormat === "stopwatch_ms_elapsed") {
    return {
      type: Type.OBJECT,
      properties: {
        elapsedMinutes: { type: Type.NUMBER },
        seconds: { type: Type.NUMBER },
      },
      required: ["elapsedMinutes", "seconds"],
    };
  }
  return {
    type: Type.OBJECT,
    properties: {
      hours: { type: Type.NUMBER },
      minutes: { type: Type.NUMBER },
      seconds: { type: Type.NUMBER },
    },
    required: ["hours", "minutes", "seconds"],
  };
}

/** Structured output schema for @google/genai */
function scanResultResponseSchemaForMode(timeFormat: ScannerTimeFormat) {
  return {
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
              value: timeValueSchemaForMode(timeFormat),
              confidence: { type: Type.STRING },
              alternatives: { type: Type.ARRAY, items: timeValueSchemaForMode(timeFormat) },
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
}

const HMS_REGEX = /^(\d{1,2}):(\d{2}):(\d{2})$/;
const MS_REGEX = /^(\d{1,2}):(\d{2})$/;

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
        responseSchema: scanResultResponseSchemaForMode(mergedContext.timeFormat ?? "clock_hms"),
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
    validateAndNormalizeTimes(
      parsed,
      requestId,
      mergedContext.timeFormat ?? "clock_hms",
      mergedContext.defaultHour,
    );
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

function normalizeOkTimeValue(
  timeValue: unknown,
  timeFormat: ScannerTimeFormat,
  defaultHour?: number,
): string | null {
  const asObject = (typeof timeValue === "object" && timeValue !== null) ? timeValue as Record<string, unknown> : null;

  if (timeFormat === "stopwatch_ms_elapsed") {
    const minutes = asObject ? Number(asObject.elapsedMinutes) : NaN;
    const seconds = asObject ? Number(asObject.seconds) : NaN;
    if (
      Number.isNaN(minutes) ||
      Number.isNaN(seconds) ||
      minutes < 0 ||
      seconds < 0 ||
      seconds > 59
    ) {
      return null;
    }
    const hours = Math.floor(minutes / 60);
    const normalizedMinutes = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(normalizedMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  let hours = asObject ? Number(asObject.hours) : NaN;
  let minutes = asObject ? Number(asObject.minutes) : NaN;
  let seconds = asObject ? Number(asObject.seconds) : NaN;

  if ((Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) && timeFormat === "clock_hms" && asObject) {
    // Allow sub-hour clock rows to omit hours in structured output.
    hours = typeof defaultHour === "number" && defaultHour >= 0 && defaultHour <= 23 ? defaultHour : 0;
    minutes = Number(asObject.elapsedMinutes ?? asObject.minutes);
    seconds = Number(asObject.seconds);
  }
  if ((Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) && timeFormat === "stopwatch_hms_elapsed" && asObject) {
    // In stopwatch elapsed mode, omitted hour means sub-hour elapsed duration.
    hours = 0;
    minutes = Number(asObject.elapsedMinutes ?? asObject.minutes);
    seconds = Number(asObject.seconds);
  }

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    minutes > 59 ||
    seconds > 59
  ) {
    if (typeof timeValue !== "string") return null;
    const hms = HMS_REGEX.exec(timeValue);
    if (!hms) {
      if (timeFormat === "stopwatch_hms_elapsed") {
        const ms = MS_REGEX.exec(timeValue);
        if (!ms) return null;
        const m = Number(ms[1]);
        const s = Number(ms[2]);
        if (Number.isNaN(m) || Number.isNaN(s) || m > 59 || s > 59) return null;
        return `00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }
      if (timeFormat !== "clock_hms") return null;
      const ms = MS_REGEX.exec(timeValue);
      if (!ms) return null;
      const m = Number(ms[1]);
      const s = Number(ms[2]);
      if (Number.isNaN(m) || Number.isNaN(s) || m > 59 || s > 59) return null;
      const h = typeof defaultHour === "number" && defaultHour >= 0 && defaultHour <= 23
        ? defaultHour
        : 0;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    hours = Number(hms[1]);
    minutes = Number(hms[2]);
    seconds = Number(hms[3]);
  }

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function validateAndNormalizeTimes(
  parsed: unknown,
  requestId: string,
  timeFormat: ScannerTimeFormat,
  defaultHour?: number,
): void {
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
      overallRowConfidence?: unknown;
      time?: { value?: unknown; confidence?: unknown };
    };
    const status = typeof rowObj.status === "string" ? rowObj.status.toUpperCase() : "OK";
    const timeValue = rowObj.time?.value;
    if (status !== "OK") {
      if (typeof rowObj.time === "object" && rowObj.time !== null) {
        (rowObj.time as { value?: unknown }).value = "";
      }
      continue;
    }

    const normalized = normalizeOkTimeValue(timeValue, timeFormat, defaultHour);
    if (!normalized) {
      logScan(requestId, "parse_model_json", "Invalid row time format; clearing value and downgrading confidence", {
        rowIndex: rowObj.rowIndex,
        status,
        timeValue,
        timeFormat,
      });
      if (typeof rowObj.time === "object" && rowObj.time !== null) {
        (rowObj.time as { value?: unknown; confidence?: unknown }).value = "";
        (rowObj.time as { value?: unknown; confidence?: unknown }).confidence = "MANUAL_CHECK";
      }
      rowObj.overallRowConfidence = "MANUAL_CHECK";
      continue;
    }

    if (typeof rowObj.time === "object" && rowObj.time !== null) {
      (rowObj.time as { value?: unknown }).value = normalized;
    }
  }
}
