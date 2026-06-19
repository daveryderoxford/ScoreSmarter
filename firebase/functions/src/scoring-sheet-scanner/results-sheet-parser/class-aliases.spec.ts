import test from "node:test";
import * as assert from "node:assert/strict";
import { mergeClassAliases, defaultClassAliasRecord } from "./class-aliases.js";

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
