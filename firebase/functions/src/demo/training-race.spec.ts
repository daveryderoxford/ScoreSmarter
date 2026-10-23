import test from "node:test";
import * as assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import type { DemoBaseline } from "./demo-baseline.js";
import { buildTrainingDocs, londonDateId, londonTime, type TrainingRaceSpec } from "./training-race.js";

test("londonTime converts UK wall-clock time in winter (GMT) and summer (BST)", () => {
  assert.equal(londonTime("2026-01-10", "11:00").toISOString(), "2026-01-10T11:00:00.000Z");
  assert.equal(londonTime("2026-06-10", "11:00").toISOString(), "2026-06-10T10:00:00.000Z");
});

test("londonDateId uses the UK date, not UTC", () => {
  assert.equal(londonDateId(new Date("2026-06-10T23:30:00Z")), "2026-06-11");
});

const generalFleet = { id: "f-gh", type: "GeneralHandicap", name: "General Handicap" };
const ilcaFleet = { id: "f-ilca7", type: "BoatClass", boatClassId: "ILCA 7" };
const baseline: DemoBaseline = {
  createdAt: "2026-10-23T00:00:00Z",
  sourceClubId: "ibrsc",
  club: {
    classes: [{ id: "ILCA 7", name: "ILCA 7", handicaps: [{ scheme: "PY", value: 1100 }] }],
    fleets: [generalFleet, ilcaFleet],
  },
  docs: {
    "series/S-sat": {
      name: "Saturday",
      seasonId: "2025-26",
      scoringAlgorithm: "long",
      entryAlgorithm: "helm",
      discards: [4, 8],
      primaryScoringConfiguration: { id: "p", name: "PY", type: "Handicap", handicapScheme: "PY", fleet: { id: "f-sat" } },
      secondaryScoringConfigurations: [{ id: "x" }],
    },
  },
};
const now = new Date("2026-06-10T08:00:00Z");

const handicap = (extra: Partial<TrainingRaceSpec> = {}): TrainingRaceSpec => ({
  key: "handicap",
  type: "Handicap",
  startTime: "10:30",
  rows: [
    { boatClass: "ILCA 7", sailNumber: "123", helm: "Alex Ashby" },
    { boatClass: "Mystery", sailNumber: "9", helm: "Sam Barker", crew: "Jo Carver", py: 1200 },
  ],
  ...extra,
});

test("buildTrainingDocs creates a training series and today's race per spec", () => {
  const { raceIds, docs } = buildTrainingDocs(
    { races: [handicap(), { key: "pursuit", type: "Pursuit", startTime: "13:00", rows: [] }] },
    baseline,
    now,
  );

  assert.deepEqual(raceIds, ["R-training-handicap-2026-06-10", "R-training-pursuit-2026-06-10"]);
  const race = docs["races/R-training-handicap-2026-06-10"];
  assert.equal(race["type"], "Handicap");
  assert.equal(race["fleetId"], "f-gh");
  assert.equal((race["scheduledStart"] as Timestamp).toDate().toISOString(), "2026-06-10T09:30:00.000Z");
  assert.equal(docs["races/R-training-pursuit-2026-06-10"]["type"], "Pursuit");

  const series = docs["series/S-training-handicap"];
  assert.equal(series["seasonId"], "training");
  assert.equal(series["name"], "Training - Handicap");
  assert.deepEqual(series["primaryScoringConfiguration"], {
    id: "overall", name: "PY", type: "Handicap", handicapScheme: "PY", fleet: generalFleet,
  });

  assert.deepEqual(docs["series-entries/SE-training-handicap-1"]["handicaps"], [{ scheme: "PY", value: 1100 }]);
  assert.deepEqual(docs["series-entries/SE-training-handicap-2"]["handicaps"], [{ scheme: "PY", value: 1200 }]);
  assert.equal(docs["series-entries/SE-training-handicap-2"]["crew"], "Jo Carver");
  assert.deepEqual(docs["race-results/RC-training-handicap-2026-06-10-1"], {
    seriesEntryId: "SE-training-handicap-1",
    raceId: "R-training-handicap-2026-06-10",
    seriesId: "S-training-handicap",
    resultCode: "NOT FINISHED",
    manualLaps: 0,
    lapTimes: [],
  });
});

test("buildTrainingDocs copies scoring rules and fleet from a template series", () => {
  const { docs } = buildTrainingDocs({ races: [handicap({ templateSeriesId: "S-sat" })] }, baseline, now);

  const series = docs["series/S-training-handicap"];
  assert.equal(series["scoringAlgorithm"], "long");
  assert.equal(series["entryAlgorithm"], "helm");
  assert.deepEqual(series["discards"], [4, 8]);
  assert.deepEqual(series["secondaryScoringConfigurations"], []);
  assert.equal(docs["races/R-training-handicap-2026-06-10"]["fleetId"], "f-sat");
});

test("buildTrainingDocs scores Level Rating in the class fleet", () => {
  const { docs } = buildTrainingDocs(
    { races: [{ key: "lr", type: "Level Rating", boatClass: "ILCA 7", rows: [{ boatClass: "ILCA 7", sailNumber: "1", helm: "A" }] }] },
    baseline,
    now,
  );

  assert.deepEqual(docs["series/S-training-lr"]["primaryScoringConfiguration"], {
    id: "overall", name: "Level Rating", type: "LevelRating", handicapScheme: "Level Rating", fleet: ilcaFleet,
  });
  assert.equal(docs["races/R-training-lr-2026-06-10"]["type"], "Level Rating");
});

test("buildTrainingDocs adds boats and entries according to each row's entered / inBoats flags", () => {
  const { docs } = buildTrainingDocs(
    {
      races: [handicap({
        rows: [
          { boatClass: "ILCA 7", sailNumber: "1", helm: "Entered And Registered" },
          { boatClass: "ILCA 7", sailNumber: "2", helm: "Entered Only", inBoats: false },
          { boatClass: "ILCA 7", sailNumber: "3", helm: "Registered Only", entered: false },
          { boatClass: "ILCA 7", sailNumber: "4", helm: "Sheet Only", entered: false, inBoats: false },
        ],
      })],
    },
    baseline,
    now,
  );

  const paths = Object.keys(docs);
  assert.deepEqual(paths.filter(p => p.startsWith("boats/")).sort(), ["boats/B-training-handicap-1", "boats/B-training-handicap-3"]);
  assert.deepEqual(paths.filter(p => p.startsWith("series-entries/")).sort(), [
    "series-entries/SE-training-handicap-1",
    "series-entries/SE-training-handicap-2",
  ]);
  assert.equal(paths.filter(p => p.startsWith("race-results/")).length, 2);
  assert.deepEqual(docs["boats/B-training-handicap-3"], {
    boatClass: "ILCA 7",
    sailNumber: "3",
    name: "",
    helm: "Registered Only",
    crew: "",
    isClub: false,
    handicaps: [{ scheme: "PY", value: 1100 }],
    ownerUid: "demo",
  });
});

test("buildTrainingDocs uses the built-in General Handicap fleet when the club does not store one", () => {
  const withoutGeneral: DemoBaseline = { ...baseline, club: { ...baseline.club, fleets: [ilcaFleet] } };
  const { docs } = buildTrainingDocs({ races: [handicap()] }, withoutGeneral, now);

  assert.equal(docs["races/R-training-handicap-2026-06-10"]["fleetId"], "general-handicap");
  assert.deepEqual((docs["series/S-training-handicap"]["primaryScoringConfiguration"] as { fleet: unknown }).fleet, {
    id: "general-handicap", type: "GeneralHandicap", name: "General Handicap",
  });
});

test("buildTrainingDocs explains a missing template series, class fleet or Level Rating class", () => {
  assert.throws(() => buildTrainingDocs({ races: [handicap({ templateSeriesId: "missing" })] }, baseline, now), /not in the baseline/);
  assert.throws(
    () => buildTrainingDocs({ races: [{ key: "lr", type: "Level Rating", boatClass: "Solo", rows: [] }] }, baseline, now),
    /no a Solo class fleet; set fleetId/,
  );
  assert.throws(() => buildTrainingDocs({ races: [{ key: "lr", type: "Level Rating", rows: [] }] }, baseline, now), /needs boatClass/);
});
