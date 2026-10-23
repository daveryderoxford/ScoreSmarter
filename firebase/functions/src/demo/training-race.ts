import { Timestamp } from "firebase-admin/firestore";
import type { DemoBaseline, DocData } from "./demo-baseline.js";

/**
 * Describes the training scoring sheet so each day's race has entries that match the
 * handwritten rows. Uploaded as JSON next to the sheet photo.
 */
export interface TrainingSheet {
  /** Baseline series whose scoring configuration, fleet and rules the training series copies. */
  templateSeriesId: string;
  /** Defaults to "Training". */
  seriesName?: string;
  /** Local (UK) start time, "HH:mm". Defaults to "11:00". */
  startTime?: string;
  rows: TrainingSheetRow[];
}

export interface TrainingSheetRow {
  boatClass: string;
  sailNumber: string;
  helm: string;
  crew?: string;
  /** PY to use when the class has no PY in the club's class list. */
  py?: number;
  /** Entered in today's race (series entry and race result). Default true. */
  entered?: boolean;
  /** In the club's boat register. Default true. */
  inBoats?: boolean;
  /** For whoever writes the sheet, e.g. "DNS". Not used by the reset. */
  note?: string;
}

export const TRAINING_SEASON = { id: "training", name: "Training", status: "current" } as const;
export const TRAINING_SERIES_ID = "S-training";

export interface TrainingDocs {
  raceId: string;
  /** Docs keyed by path relative to the club. */
  docs: Record<string, DocData>;
}

/** `yyyy-mm-dd` for the given instant in Europe/London. */
export function londonDateId(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

/** The instant of a Europe/London wall-clock time (handles GMT/BST). */
export function londonTime(dateId: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const asUtc = Date.parse(`${dateId}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const londonParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(asUtc));
  const part = (type: string) => Number(londonParts.find(p => p.type === type)?.value);
  const offsetMinutes = (part("hour") * 60 + part("minute")) - (h * 60 + m);
  return new Date(asUtc - offsetMinutes * 60_000);
}

function classHandicaps(baseline: DemoBaseline, boatClass: string, py: number | undefined): unknown[] {
  const classes = (baseline.club["classes"] as DocData[] | undefined) ?? [];
  const match = classes.find(c => c["name"] === boatClass || c["id"] === boatClass);
  const handicaps = (match?.["handicaps"] as unknown[] | undefined) ?? [];
  if (handicaps.length > 0) return handicaps;
  return py !== undefined ? [{ scheme: "PY", value: py }] : [];
}

/**
 * Training series (in the Training season) and today's race, ready for an AI scan of the
 * training sheet. Rows that are `entered` get a series entry and an unfinished race
 * result; rows that are `inBoats` get a boat in the register. Rows with neither are on
 * the sheet only, so the trainee has to add them.
 */
export function buildTrainingDocs(sheet: TrainingSheet, baseline: DemoBaseline, now: Date): TrainingDocs {
  const template = baseline.docs[`series/${sheet.templateSeriesId}`];
  if (!template) throw new Error(`Template series ${sheet.templateSeriesId} is not in the baseline`);
  const config = template["primaryScoringConfiguration"] as DocData & { fleet: DocData };
  if (!config?.fleet) throw new Error(`Template series ${sheet.templateSeriesId} has no scoring configuration`);

  const dateId = londonDateId(now);
  const start = Timestamp.fromDate(londonTime(dateId, sheet.startTime ?? "11:00"));
  const seriesName = sheet.seriesName ?? "Training";
  const raceId = `R-training-${dateId}`;
  const seriesId = TRAINING_SERIES_ID;

  const docs: Record<string, DocData> = {
    [`series/${seriesId}`]: {
      ...template,
      name: seriesName,
      seasonId: TRAINING_SEASON.id,
      archived: false,
      startDate: start,
      endDate: start,
      secondaryScoringConfigurations: [],
      divisions: [],
      dirty: false,
    },
    [`races/${raceId}`]: {
      seriesId,
      seriesName,
      fleetId: config.fleet["id"],
      index: 1,
      raceOfDay: 1,
      scheduledStart: start,
      type: "Handicap",
      status: "Future",
      isDiscardable: true,
      isAverageLap: false,
      resultsSheetImage: "",
      dirty: false,
    },
  };

  sheet.rows.forEach((row, i) => {
    const handicaps = classHandicaps(baseline, row.boatClass, row.py);
    if (row.inBoats ?? true) {
      docs[`boats/B-training-${i + 1}`] = {
        boatClass: row.boatClass,
        sailNumber: row.sailNumber,
        name: "",
        helm: row.helm,
        crew: row.crew ?? "",
        isClub: false,
        handicaps,
        ownerUid: "demo",
      };
    }
    if (!(row.entered ?? true)) return;
    const entryId = `SE-training-${i + 1}`;
    docs[`series-entries/${entryId}`] = {
      seriesId,
      helm: row.helm,
      ...(row.crew ? { crew: row.crew } : {}),
      boatClass: row.boatClass,
      sailNumber: row.sailNumber,
      handicaps,
      divisions: [],
    };
    docs[`race-results/RC-training-${dateId}-${i + 1}`] = {
      seriesEntryId: entryId,
      raceId,
      seriesId,
      resultCode: "NOT FINISHED",
      manualLaps: 0,
      lapTimes: [],
    };
  });

  return { raceId, docs };
}
