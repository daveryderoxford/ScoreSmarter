import { Timestamp } from "firebase-admin/firestore";
import type { DemoBaseline, DocData } from "./demo-baseline.js";

export type TrainingRaceType = "Handicap" | "Pursuit" | "Level Rating";

/**
 * Describes the printed training scoring sheets so each day's training races have
 * entries and boats that match their handwritten rows. Trainees photograph and upload
 * the sheets themselves.
 */
export interface TrainingSheet {
  races: TrainingRaceSpec[];
}

export interface TrainingRaceSpec {
  /** Short id used in document ids, e.g. "handicap". Unique within the sheet. */
  key: string;
  type: TrainingRaceType;
  /** Defaults to "Training - {type}". */
  seriesName?: string;
  /** Local (UK) start time, "HH:mm". Defaults to "11:00". */
  startTime?: string;
  /**
   * Baseline series whose scoring rules (scheme, entry grouping, discards and primary
   * scoring configuration with its fleet) the training series copies. Optional.
   */
  templateSeriesId?: string;
  /**
   * Club fleet to race in when there is no template. Defaults to the club's General
   * Handicap fleet, or for Level Rating the club's fleet for `boatClass`.
   */
  fleetId?: string;
  /** Level Rating only: the one-design class (all rows must be this class). */
  boatClass?: string;
  rows: TrainingSheetRow[];
}

export interface TrainingSheetRow {
  boatClass: string;
  sailNumber: string;
  helm: string;
  crew?: string;
  /** PY to use when the class has no PY in the club's class list. */
  py?: number;
  /** Entered in the race (series entry and race result). Default true. */
  entered?: boolean;
  /** In the club's boat register. Default true. */
  inBoats?: boolean;
  /** For whoever writes the sheet, e.g. "DNS". Not used by the reset. */
  note?: string;
}

export const TRAINING_SEASON = { id: "training", name: "Training", status: "current" } as const;

export interface TrainingDocs {
  raceIds: string[];
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

/** Every club has this fleet; the app adds it (ClubStore) rather than storing it on the club. */
const GENERAL_HANDICAP_FLEET: DocData = { id: "general-handicap", type: "GeneralHandicap", name: "General Handicap" };

function trainingFleet(baseline: DemoBaseline, spec: TrainingRaceSpec): DocData {
  const stored = (baseline.club["fleets"] as DocData[] | undefined) ?? [];
  const fleets = stored.some(f => f["type"] === "GeneralHandicap") ? stored : [GENERAL_HANDICAP_FLEET, ...stored];
  const fleet = spec.fleetId
    ? fleets.find(f => f["id"] === spec.fleetId)
    : spec.type === "Level Rating"
      ? fleets.find(f => f["type"] === "BoatClass" && f["boatClassId"] === spec.boatClass)
      : fleets.find(f => f["type"] === "GeneralHandicap");
  if (!fleet) {
    const wanted = spec.fleetId
      ? `fleet ${spec.fleetId}`
      : spec.type === "Level Rating" ? `a ${spec.boatClass} class fleet` : "a General Handicap fleet";
    throw new Error(`Training race "${spec.key}": the club has no ${wanted}; set fleetId`);
  }
  return fleet;
}

function scoringConfiguration(spec: TrainingRaceSpec, fleet: DocData): DocData {
  return spec.type === "Level Rating"
    ? { id: "overall", name: "Level Rating", type: "LevelRating", handicapScheme: "Level Rating", fleet }
    : { id: "overall", name: "PY", type: "Handicap", handicapScheme: "PY", fleet };
}

/** Scoring rules for the training series: copied from the template series, or defaults. */
function seriesScoring(baseline: DemoBaseline, spec: TrainingRaceSpec): { scoring: DocData; fleet: DocData } {
  if (spec.templateSeriesId) {
    const template = baseline.docs[`series/${spec.templateSeriesId}`];
    if (!template) throw new Error(`Training race "${spec.key}": template series ${spec.templateSeriesId} is not in the baseline`);
    const config = template["primaryScoringConfiguration"] as DocData | undefined;
    const fleet = config?.["fleet"] as DocData | undefined;
    if (!config || !fleet) throw new Error(`Training race "${spec.key}": template series has no scoring configuration`);
    return {
      fleet,
      scoring: {
        scoringAlgorithm: template["scoringAlgorithm"] ?? "short",
        entryAlgorithm: template["entryAlgorithm"] ?? "classSailNumberHelm",
        discards: template["discards"] ?? [],
        primaryScoringConfiguration: config,
      },
    };
  }
  const fleet = trainingFleet(baseline, spec);
  return {
    fleet,
    scoring: {
      scoringAlgorithm: "short",
      entryAlgorithm: "classSailNumberHelm",
      discards: [],
      primaryScoringConfiguration: scoringConfiguration(spec, fleet),
    },
  };
}

/**
 * For each training race: a series in the Training season and today's race. Rows that
 * are `entered` get a series entry and an unfinished race result; rows that are
 * `inBoats` get a boat in the register. Rows with neither are on the sheet only, so the
 * trainee has to add them.
 */
export function buildTrainingDocs(sheet: TrainingSheet, baseline: DemoBaseline, now: Date): TrainingDocs {
  const dateId = londonDateId(now);
  const docs: Record<string, DocData> = {};
  const raceIds: string[] = [];

  for (const spec of sheet.races) {
    if (spec.type === "Level Rating" && !spec.boatClass) {
      throw new Error(`Training race "${spec.key}": Level Rating needs boatClass`);
    }
    const { fleet, scoring } = seriesScoring(baseline, spec);
    const start = Timestamp.fromDate(londonTime(dateId, spec.startTime ?? "11:00"));
    const seriesName = spec.seriesName ?? `Training - ${spec.type}`;
    const seriesId = `S-training-${spec.key}`;
    const raceId = `R-training-${spec.key}-${dateId}`;
    raceIds.push(raceId);

    docs[`series/${seriesId}`] = {
      name: seriesName,
      seasonId: TRAINING_SEASON.id,
      archived: false,
      startDate: start,
      endDate: start,
      ...scoring,
      secondaryScoringConfigurations: [],
      divisions: [],
      dirty: false,
    };
    docs[`races/${raceId}`] = {
      seriesId,
      seriesName,
      fleetId: fleet["id"],
      index: 1,
      raceOfDay: 1,
      scheduledStart: start,
      type: spec.type,
      status: "Future",
      isDiscardable: true,
      isAverageLap: false,
      resultsSheetImage: "",
      dirty: false,
    };

    spec.rows.forEach((row, i) => {
      const n = i + 1;
      const handicaps = classHandicaps(baseline, row.boatClass, row.py);
      if (row.inBoats ?? true) {
        docs[`boats/B-training-${spec.key}-${n}`] = {
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
      const entryId = `SE-training-${spec.key}-${n}`;
      docs[`series-entries/${entryId}`] = {
        seriesId,
        helm: row.helm,
        ...(row.crew ? { crew: row.crew } : {}),
        boatClass: row.boatClass,
        sailNumber: row.sailNumber,
        handicaps,
        divisions: [],
      };
      docs[`race-results/RC-training-${spec.key}-${dateId}-${n}`] = {
        seriesEntryId: entryId,
        raceId,
        seriesId,
        resultCode: "NOT FINISHED",
        manualLaps: 0,
        lapTimes: [],
      };
    });
  }

  return { raceIds, docs };
}
