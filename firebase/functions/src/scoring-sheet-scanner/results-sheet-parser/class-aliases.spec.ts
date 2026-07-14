import test from "node:test";
import * as assert from "node:assert/strict";
import { mergeClassAliases, defaultClassAliasRecord, resolveClassAlias, normalizeBoatClasses } from "./class-aliases.js";

test("mergeClassAliases returns defaults when overrides are undefined", () => {
  const merged = mergeClassAliases(undefined);
  assert.equal(merged["Laser R"], "ILCA 6");
  assert.equal(merged["LR"], "ILCA 6");
  assert.equal(merged["300"], "RS300");
});

test("mergeClassAliases returns defaults when overrides are empty object", () => {
  const merged = mergeClassAliases({});
  assert.equal(merged["Laser"], "ILCA 7");
  assert.deepEqual(Object.keys(merged).length, Object.keys(defaultClassAliasRecord).length);
});

test("mergeClassAliases merges client overrides on top of defaults", () => {
  const merged = mergeClassAliases({ Foo: "Bar" });
  assert.equal(merged["Foo"], "Bar");
  assert.equal(merged["Laser R"], "ILCA 6");
});

test("resolveClassAlias maps Radial and Laser R case-insensitively", () => {
  assert.equal(resolveClassAlias("Radial"), "ILCA 6");
  assert.equal(resolveClassAlias("radial"), "ILCA 6");
  assert.equal(resolveClassAlias("Laser R"), "ILCA 6");
  assert.equal(resolveClassAlias("Laser"), "ILCA 7");
  assert.equal(resolveClassAlias("ILCA 6"), "ILCA 6");
});

test("normalizeBoatClasses rewrites value and keeps sheet text in alternatives", () => {
  const parsed = {
    scannedResults: [{
      rowIndex: 1,
      boatClass: {
        value: "Radial",
        confidence: "HIGH",
        alternatives: ["Laser R", "ILCA 6"],
      },
    }],
  };
  normalizeBoatClasses(parsed);
  assert.equal(parsed.scannedResults[0].boatClass.value, "ILCA 6");
  assert.deepEqual(parsed.scannedResults[0].boatClass.alternatives, ["Radial", "Laser R"]);
});
