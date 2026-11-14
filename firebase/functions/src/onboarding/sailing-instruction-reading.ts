import {
  ApiError,
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type GenerateContentResponse,
} from "@google/genai";
import type {
  DncProposal,
  OodCalculationCode,
  OodProposal,
  SailingInstructionReading,
  SeriesScoringProposal,
} from "@shared/sailing-instructions";
import type { ScannerThinkingLevel } from "@shared/scanner-context";
import {
  DEFAULT_SCAN_MODEL,
  type ScanModelParams,
} from "../scoring-sheet-scanner/ai-scan-model.js";
import { detailedHttpsError } from "../shared/https-error.js";

const GCP_PROJECT = process.env.GCLOUD_PROJECT || "sailbrowser-efef0";
const MAX_TEXT_CHARS = 80_000;

const THINKING_LEVEL_TO_SDK: Record<ScannerThinkingLevel, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

const SERIES_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    discardsStated: { type: Type.BOOLEAN },
    discards: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    discardQuote: { type: Type.STRING },
    dncStated: { type: Type.BOOLEAN },
    dncBasis: { type: Type.STRING },
    dncOffset: { type: Type.INTEGER },
    excludeNeverRaced: { type: Type.BOOLEAN },
    dncQuote: { type: Type.STRING },
    unmapped: { type: Type.STRING },
  },
  required: [
    "discardsStated",
    "discards",
    "discardQuote",
    "dncStated",
    "dncBasis",
    "dncOffset",
    "excludeNeverRaced",
    "dncQuote",
    "unmapped",
  ],
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    shortSeries: SERIES_SCHEMA,
    longSeries: SERIES_SCHEMA,
    oodStated: { type: Type.BOOLEAN },
    oodCalculation: { type: Type.STRING },
    maxDuties: { type: Type.INTEGER },
    oodQuote: { type: Type.STRING },
    oodUnmapped: { type: Type.STRING },
    longSeriesNote: { type: Type.STRING },
  },
  required: [
    "shortSeries",
    "longSeries",
    "oodStated",
    "oodCalculation",
    "maxDuties",
    "oodQuote",
    "oodUnmapped",
    "longSeriesNote",
  ],
};

export function sailingInstructionPrompt(): string {
  return [
    "Read these sailing instructions and extract only scoring rules the text states.",
    "Return JSON matching the schema. Do not invent a World Sailing default when the text is silent.",
    "A discard profile is the race numbers at which one more discard is allowed.",
    "Example: one discard after 4 races and a second after 8 is discards [4, 8].",
    "discardsStated is false when the text does not give a discard rule. An empty discards array with discardsStated true means no discards.",
    "dncBasis is SeriesEntries when DNC is the number of boats entered in the series, or MaxRaceCompetitors when it is the largest race.",
    "dncOffset is 1 or 2. excludeNeverRaced is true only when boats that never start are left out of the count.",
    "DNS, DNF, and RET scored as boats that came to the starting area plus one is the long series, not the DNC rule. Put that in longSeriesNote.",
    "oodCalculation is AvgAll for an average of races sailed, AvgExcludingDiscards when discards are left out of that average, or FixedScore for a fixed duty score.",
    "maxDuties is how many duty races count. Use 0 when the text does not say.",
    "Quotes must be copied from the text. Put rules that do not fit these fields in unmapped, including percentage discards, entries + 2, starters in that race, and a fixed points number.",
    "Use the shortSeries fields for regattas and short series, and longSeries for the season series. If the text gives one rule for both, copy it into both.",
  ].join("\n");
}

export async function readSailingInstructions(
  text: string,
  modelParams: ScanModelParams,
  requestId: string,
): Promise<SailingInstructionReading> {
  const genai = new GoogleGenAI({
    vertexai: true,
    project: GCP_PROJECT,
    location: modelParams.location,
  });
  const thinkingLevel = THINKING_LEVEL_TO_SDK[modelParams.thinkingLevel];
  let result: GenerateContentResponse;
  try {
    result = await genai.models.generateContent({
      model: modelParams.model || DEFAULT_SCAN_MODEL,
      contents: [{ role: "user", parts: [{ text: `${sailingInstructionPrompt()}\n\n${text}` }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof ApiError ? error.status : undefined;
    throw detailedHttpsError("internal", `AI request failed (${message}).`, {
      requestId,
      stage: "vertex_generate",
      cause: "vertex_error",
      model: modelParams.model,
      httpStatus: status,
    });
  }

  const resultJson = result.text ?? result.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!resultJson) {
    throw detailedHttpsError("internal", "No text returned from Gemini.", {
      requestId,
      stage: "vertex_generate",
      cause: "empty_model_text",
    });
  }
  try {
    return normaliseSailingInstructionReading(JSON.parse(resultJson) as unknown, text);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw detailedHttpsError("internal", "Model returned invalid JSON.", {
      requestId,
      stage: "parse_model_json",
      cause: "json_parse_failed",
      parseError: message.slice(0, 300),
    });
  }
}

/** Drops any value whose quote is not in the source text, and any rule this app cannot store. */
export function normaliseSailingInstructionReading(raw: unknown, sourceText: string): SailingInstructionReading {
  const record = asRecord(raw);
  return {
    shortSeries: normaliseSeries(record["shortSeries"], sourceText),
    longSeries: normaliseSeries(record["longSeries"], sourceText),
    ood: normaliseOod(record, sourceText),
    longSeriesNote: quotedOrNull(record["longSeriesNote"], sourceText),
  };
}

export function assertInstructionText(text: unknown, requestId: string): string {
  if (typeof text !== "string" || text.trim().length < 40) {
    throw detailedHttpsError("invalid-argument", "Paste or upload the sailing instructions first.", {
      requestId,
      stage: "validate_input",
      cause: "missing_text",
    });
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw detailedHttpsError("invalid-argument", "The sailing instructions text is too long.", {
      requestId,
      stage: "validate_input",
      cause: "text_too_long",
    });
  }
  return text;
}

function normaliseSeries(raw: unknown, sourceText: string): SeriesScoringProposal {
  const record = asRecord(raw);
  const unmapped: string[] = [];
  const extra = cleanText(record["unmapped"]);
  if (extra) unmapped.push(extra);

  let discards: number[] | null = null;
  let discardQuote: string | null = null;
  if (record["discardsStated"] === true) {
    const quote = quotedOrNull(record["discardQuote"], sourceText);
    const milestones = milestoneList(record["discards"]);
    if (!quote || !milestones) {
      unmapped.push("A discard rule was returned without a sentence from the instructions.");
    } else {
      discards = milestones;
      discardQuote = quote;
    }
  }

  let dnc: DncProposal | null = null;
  let dncQuote: string | null = null;
  if (record["dncStated"] === true) {
    const quote = quotedOrNull(record["dncQuote"], sourceText);
    const proposal = dncProposal(record["dncBasis"], record["dncOffset"], record["excludeNeverRaced"]);
    if (!quote || !proposal) {
      unmapped.push(proposal
        ? "A DNC rule was returned without a sentence from the instructions."
        : "The DNC rule does not match series entries + 1 or the largest race + 1 or + 2.");
    } else {
      dnc = proposal;
      dncQuote = quote;
    }
  }

  return {
    discards,
    dnc,
    discardQuote,
    dncQuote,
    unmapped: unmapped.length > 0 ? unmapped.join(" ") : null,
  };
}

function normaliseOod(record: Record<string, unknown>, sourceText: string): OodProposal {
  const unmapped: string[] = [];
  const extra = cleanText(record["oodUnmapped"]);
  if (extra) unmapped.push(extra);
  if (record["oodStated"] !== true) {
    return { calculationCode: null, maxDuties: null, quote: null, unmapped: unmapped.join(" ") || null };
  }
  const quote = quotedOrNull(record["oodQuote"], sourceText);
  const calculationCode = oodCode(record["oodCalculation"]);
  const maxDuties = positiveInt(record["maxDuties"]);
  if (!quote || !calculationCode) {
    unmapped.push("A duty rule was returned without a sentence from the instructions.");
    return { calculationCode: null, maxDuties: null, quote: null, unmapped: unmapped.join(" ") };
  }
  return {
    calculationCode,
    maxDuties: maxDuties != null && maxDuties <= 20 ? maxDuties : null,
    quote,
    unmapped: unmapped.join(" ") || null,
  };
}

function dncProposal(basisRaw: unknown, offsetRaw: unknown, excludeRaw: unknown): DncProposal | null {
  const offset = positiveInt(offsetRaw);
  const excludeNeverRaced = excludeRaw === true;
  if (basisRaw === "SeriesEntries" && offset === 1) {
    return { basis: "SeriesEntries", offset: 1, excludeNeverRaced };
  }
  if (basisRaw === "MaxRaceCompetitors" && (offset === 1 || offset === 2)) {
    return { basis: "MaxRaceCompetitors", offset, excludeNeverRaced };
  }
  return null;
}

function oodCode(value: unknown): OodCalculationCode | null {
  if (value === "AvgAll" || value === "AvgExcludingDiscards" || value === "FixedScore") return value;
  return null;
}

function milestoneList(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const milestones = value.map(positiveInt).filter((item): item is number => item != null);
  if (milestones.length !== value.length) return null;
  for (let index = 1; index < milestones.length; index++) {
    if (milestones[index] < milestones[index - 1]) return null;
  }
  return milestones;
}

function quotedOrNull(value: unknown, sourceText: string): string | null {
  const quote = cleanText(value);
  if (!quote || quote.length < 8) return null;
  return squash(sourceText).includes(squash(quote)) ? quote : null;
}

function positiveInt(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(number) || number < 1) return null;
  return number;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
