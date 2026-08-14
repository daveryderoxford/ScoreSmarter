import test from "node:test";
import * as assert from "node:assert/strict";
import { fleetClassName, fleetNameMapFromClubData } from "./fleet-class-name.js";

test("fleetClassName uses boatClassId for BoatClass fleets", () => {
  assert.equal(fleetClassName({ type: "BoatClass", boatClassId: "ILCA 7", name: "Laser" }), "ILCA 7");
});

test("fleetClassName uses name for other fleet types", () => {
  assert.equal(fleetClassName({ type: "HandicapRange", name: "Fast handicap" }), "Fast handicap");
  assert.equal(fleetClassName({ type: "Tag", name: "Youth" }), "Youth");
  assert.equal(fleetClassName({ type: "GeneralHandicap", name: "General Handicap" }), "General Handicap");
});

test("fleetNameMapFromClubData indexes by fleet id", () => {
  const map = fleetNameMapFromClubData([
    { id: "ilca7", type: "BoatClass", boatClassId: "ILCA 7" },
    { id: "fast", type: "HandicapRange", name: "Fast handicap" },
    { id: "skip" },
  ]);
  assert.equal(map.get("ilca7"), "ILCA 7");
  assert.equal(map.get("fast"), "Fast handicap");
  assert.equal(map.has("skip"), false);
});
