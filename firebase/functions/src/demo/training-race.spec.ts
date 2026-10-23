import test from "node:test";
import * as assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import type { DemoBaseline } from "./demo-baseline.js";
import { buildTrainingDocs, londonDateId, londonTime, TRAINING_SERIES_ID } from "./training-race.js";

test("londonTime converts UK wall-clock time in winter (GMT) and summer (BST)", () => {
  assert.equal(londonTime("2026-01-10", "11:00").toISOString(), "2026-01-10T11:00:00.000Z");
  assert.equal(londonTime("2026-06-10", "11:00").toISOString(), "2026-06-10T10:00:00.000Z");
});

test("londonDateId uses the UK date, not UTC", () => {
  assert.equal(londonDateId(new Date("2026-06-10T23:30:00Z")), "2026-06-11");
});

const baseline: DemoBaseline = {
  createdAt: "2026-10-23T00:00:00Z",
  sourceClubId: "ibrsc",
  club: { classes: [{ id: "ILCA 7", name: "ILCA 7", handicaps: [{ scheme: "PY", value: 1100 }] }] },
  docs: {
    "series/S-sat": {
      name: "Saturday",
      seasonId: "2025-26",
      scoringAlgorithm: "short",
      entryAlgorithm: "classSailNumberHelm",
      discards: [],
      primaryScoringConfiguration: { id: "p", name: "PY", type: "Handicap", handicapScheme: "PY", fleet: { id: "f-all" } },
      secondaryScoringConfigurations: [{ id: "x" }],
    },
  },
};

test("buildTrainingDocs creates today's race with an unfinished entry per sheet row", () => {
  const { raceId, docs } = buildTrainingDocs(
    {
      templateSeriesId: "S-sat",
      startTime: "10:30",
      rows: [
        { boatClass: "ILCA 7", sailNumber: "123", helm: "Alex Ashby" },
        { boatClass: "Mystery", sailNumber: "9", helm: "Sam Barker", crew: "Jo Carver", py: 1200 },
      ],
    },
    baseline,
    new Date("2026-06-10T08:00:00Z"),
  );

  assert.equal(raceId, "R-training-2026-06-10");
  const series = docs[`series/${TRAINING_SERIES_ID}`];
  assert.equal(series["seasonId"], "training");
  assert.deepEqual(series["secondaryScoringConfigurations"], []);

  const race = docs[`races/${raceId}`];
  assert.equal(race["fleetId"], "f-all");
  assert.equal((race["scheduledStart"] as Timestamp).toDate().toISOString(), "2026-06-10T09:30:00.000Z");

  assert.deepEqual(docs["series-entries/SE-training-1"]["handicaps"], [{ scheme: "PY", value: 1100 }]);
  assert.deepEqual(docs["series-entries/SE-training-2"]["handicaps"], [{ scheme: "PY", value: 1200 }]);
  assert.equal(docs["series-entries/SE-training-2"]["crew"], "Jo Carver");
  assert.deepEqual(docs["race-results/RC-training-2026-06-10-1"], {
    seriesEntryId: "SE-training-1",
    raceId,
    seriesId: TRAINING_SERIES_ID,
    resultCode: "NOT FINISHED",
    manualLaps: 0,
    lapTimes: [],
  });
});

test("buildTrainingDocs adds boats and entries according to each row's entered / inBoats flags", () => {
  const { docs } = buildTrainingDocs(
    {
      templateSeriesId: "S-sat",
      rows: [
        { boatClass: "ILCA 7", sailNumber: "1", helm: "Entered And Registered" },
        { boatClass: "ILCA 7", sailNumber: "2", helm: "Entered Only", inBoats: false },
        { boatClass: "ILCA 7", sailNumber: "3", helm: "Registered Only", entered: false },
        { boatClass: "ILCA 7", sailNumber: "4", helm: "Sheet Only", entered: false, inBoats: false },
      ],
    },
    baseline,
    new Date("2026-06-10T08:00:00Z"),
  );

  const paths = Object.keys(docs);
  assert.deepEqual(paths.filter(p => p.startsWith("boats/")).sort(), ["boats/B-training-1", "boats/B-training-3"]);
  assert.deepEqual(paths.filter(p => p.startsWith("series-entries/")).sort(), [
    "series-entries/SE-training-1",
    "series-entries/SE-training-2",
  ]);
  assert.equal(paths.filter(p => p.startsWith("race-results/")).length, 2);
  assert.deepEqual(docs["boats/B-training-3"], {
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

test("buildTrainingDocs rejects a template series that is not in the baseline", () => {
  assert.throws(() => buildTrainingDocs({ templateSeriesId: "missing", rows: [] }, baseline, new Date()), /not in the baseline/);
});
