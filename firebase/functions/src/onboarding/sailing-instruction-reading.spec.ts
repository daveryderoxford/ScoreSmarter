import test from "node:test";
import * as assert from "node:assert/strict";
import { normaliseSailingInstructionReading } from "./sailing-instruction-reading.js";

const SOURCE = [
  "When 4 or more races have been completed, a boat may discard her worst score.",
  "When 8 or more races have been completed, a boat may discard her two worst scores.",
  "A boat that did not come to the starting area shall be scored points for the number of boats entered in the series plus one.",
  "A boat that performs a duty shall be awarded average points for the races sailed, for at most two duties.",
].join(" ");

function rawSeries(quote: string) {
  return {
    discardsStated: true,
    discards: [4, 8],
    discardQuote: quote,
    dncStated: true,
    dncBasis: "SeriesEntries",
    dncOffset: 1,
    excludeNeverRaced: false,
    dncQuote: "scored points for the number of boats entered in the series plus one",
    unmapped: "",
  };
}

test("keeps rules whose quotes are in the sailing instructions", () => {
  const reading = normaliseSailingInstructionReading({
    shortSeries: rawSeries("When 4 or more races have been completed, a boat may discard her worst score."),
    longSeries: rawSeries("When 8 or more races have been completed, a boat may discard her two worst scores."),
    oodStated: true,
    oodCalculation: "AvgAll",
    maxDuties: 2,
    oodQuote: "awarded average points for the races sailed, for at most two duties",
    oodUnmapped: "",
    longSeriesNote: "",
  }, SOURCE);

  assert.deepEqual(reading.longSeries.discards, [4, 8]);
  assert.deepEqual(reading.longSeries.dnc, {
    basis: "SeriesEntries",
    offset: 1,
    excludeNeverRaced: false,
  });
  assert.equal(reading.ood.calculationCode, "AvgAll");
  assert.equal(reading.ood.maxDuties, 2);
});

test("drops a rule when the quote is not in the document", () => {
  const reading = normaliseSailingInstructionReading({
    shortSeries: rawSeries("This sentence was not in the instructions at all."),
    longSeries: { ...rawSeries("When 4 or more races have been completed, a boat may discard her worst score."), dncStated: false },
    oodStated: false,
    oodCalculation: "",
    maxDuties: 0,
    oodQuote: "",
    oodUnmapped: "Scored as 5 points.",
    longSeriesNote: "not a quote from the file",
  }, SOURCE);

  assert.equal(reading.shortSeries.discards, null);
  assert.match(reading.shortSeries.unmapped ?? "", /without a sentence/);
  assert.equal(reading.ood.calculationCode, null);
  assert.equal(reading.ood.unmapped, "Scored as 5 points.");
  assert.equal(reading.longSeriesNote, null);
});

test("rejects a DNC offset the defaults screen cannot store", () => {
  const reading = normaliseSailingInstructionReading({
    shortSeries: {
      ...rawSeries("When 4 or more races have been completed, a boat may discard her worst score."),
      dncBasis: "SeriesEntries",
      dncOffset: 2,
    },
    longSeries: rawSeries("When 8 or more races have been completed, a boat may discard her two worst scores."),
    oodStated: false,
    oodCalculation: "",
    maxDuties: 0,
    oodQuote: "",
    oodUnmapped: "",
    longSeriesNote: "",
  }, SOURCE);

  assert.equal(reading.shortSeries.dnc, null);
  assert.match(reading.shortSeries.unmapped ?? "", /does not match/);
});
