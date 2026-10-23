import { Timestamp } from "firebase-admin/firestore";

/** The only club the demo reset may ever write to. */
export const DEMO_CLUB_ID = "demo";

/** Storage folder for the demo baseline and training sheet rows (not publicly readable). */
export const DEMO_STORAGE_PREFIX = "system/private/demo";
export const BASELINE_FILE = `${DEMO_STORAGE_PREFIX}/baseline.json`;
export const TRAINING_SHEET_FILE = `${DEMO_STORAGE_PREFIX}/training-sheet.json`;

/** Firestore doc recording the last reset (used to find documents changed since). */
export const RESET_STATE_DOC = "system/private/demo/resetState";

/** Club collections restored from the baseline. `published_series/{id}/races` are included. */
export const RESTORED_COLLECTIONS = [
  "boats",
  "series",
  "races",
  "series-entries",
  "race-results",
  "published_seasons",
  "published_series",
] as const;

/** Club collections emptied on every reset (trainee scans and capture sessions). */
export const CLEARED_COLLECTIONS = ["scan-results", "results-sheet-capture-sessions"] as const;

/** Club document fields taken from the baseline; the demo keeps its own name, contact, logo etc. */
export const BASELINE_CLUB_FIELDS = [
  "fleets",
  "classes",
  "seasons",
  "supportedHandicapSchemes",
  "laps",
  "oodScoring",
  "longSeriesDefaults",
  "shortSeriesDefaults",
  "suspectTimeThresholds",
] as const;

export type DocData = Record<string, unknown>;

/**
 * Anonymised snapshot of a club, stored as JSON. `docs` is keyed by path relative to
 * the club, e.g. `boats/B-x` or `published_series/S-x/races/R-y`.
 */
export interface DemoBaseline {
  createdAt: string;
  sourceClubId: string;
  club: DocData;
  docs: Record<string, DocData>;
}

type EncodedTimestamp = { __ts: number };

const isEncodedTimestamp = (v: unknown): v is EncodedTimestamp =>
  !!v && typeof v === "object" && Object.keys(v).length === 1 && typeof (v as EncodedTimestamp).__ts === "number";

/** JSON-safe copy of Firestore data; timestamps become `{ __ts: millis }`. */
export function encodeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return { __ts: value.toMillis() };
  if (value instanceof Date) return { __ts: value.getTime() };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)]));
  }
  return value;
}

/** Firestore data from {@link encodeValue} output. */
export function decodeValue(value: unknown): unknown {
  if (isEncodedTimestamp(value)) return Timestamp.fromMillis(value.__ts);
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeValue(v)]));
  }
  return value;
}

export interface RestorePlan {
  /** Paths to (re)write from the baseline. */
  writes: string[];
  /** Paths in the demo club that are not in the baseline. */
  deletes: string[];
}

/**
 * Restores only what changed: baseline docs that are missing or were updated after the
 * last reset are rewritten; docs that are not in the baseline are deleted. Without a
 * previous reset everything in the baseline is written.
 */
export function planRestore(
  baselinePaths: Iterable<string>,
  existing: ReadonlyMap<string, number>,
  lastResetMillis: number | undefined,
): RestorePlan {
  const baseline = new Set(baselinePaths);
  const writes = [...baseline].filter(path => {
    const updated = existing.get(path);
    return updated === undefined || lastResetMillis === undefined || updated > lastResetMillis;
  });
  const deletes = [...existing.keys()].filter(path => !baseline.has(path));
  return { writes, deletes };
}
