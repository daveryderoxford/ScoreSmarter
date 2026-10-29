import test from "node:test";
import * as assert from "node:assert/strict";
import { buildClubClass, localClassId, parseAddClubClassRequest, type BoatClass, type CatalogClass } from "./club-class.js";

const catalogue: CatalogClass[] = [
  { catalogueId: 191, name: "ILCA 7", crew: 1, rya: { name: "ILCA 7 / LASER", pn: 1100 } },
  { catalogueId: 303, name: "RS200", crew: 2, rya: { name: "RS200", pn: null } },
  { catalogueId: -4, name: "Dory", crew: 2 },
];
const existing: BoatClass[] = [
  { id: "rya-379", name: "Topper", kind: "rya", catalogueId: 379, handicaps: [] },
  { id: "local-dory", name: "Dory", kind: "local", handicaps: [] },
];

test("parseAddClubClassRequest checks types", () => {
  assert.equal(typeof parseAddClubClassRequest({ clubId: "ibrsc", kind: "rya", catalogueId: 191 }), "object");
  assert.match(parseAddClubClassRequest({ kind: "rya", catalogueId: 191 }) as string, /clubId/);
  assert.match(parseAddClubClassRequest({ clubId: "ibrsc", kind: "x" }) as string, /kind/);
  assert.match(parseAddClubClassRequest({ clubId: "ibrsc", kind: "rya", catalogueId: -4 }) as string, /RYA Class ID/);
  assert.match(parseAddClubClassRequest({ clubId: "ibrsc", kind: "local" }) as string, /name/);
  assert.match(
    parseAddClubClassRequest({ clubId: "ibrsc", kind: "local", name: "X", handicaps: [{ scheme: "PY", value: 0 }] }) as string,
    /positive/,
  );
});

test("buildClubClass builds an RYA class from the catalogue with the RYA PN", () => {
  assert.deepEqual(buildClubClass({ clubId: "c", kind: "rya", catalogueId: 191 }, existing, catalogue), {
    id: "rya-191",
    name: "ILCA 7",
    kind: "rya",
    catalogueId: 191,
    isSinglehander: true,
    handicaps: [{ scheme: "PY", value: 1100 }],
    pyOverridden: false,
  });
});

test("buildClubClass treats a PY differing from the RYA PN as an override", () => {
  const request = { clubId: "c", kind: "rya" as const, catalogueId: 191, handicaps: [{ scheme: "PY", value: 1090 }, { scheme: "LR", value: 7 }] };
  const c = buildClubClass(request, existing, catalogue) as BoatClass;
  assert.deepEqual(c.handicaps, [{ scheme: "PY", value: 1090 }, { scheme: "LR", value: 7 }]);
  assert.equal(c.pyOverridden, true);
  const noPn = buildClubClass({ clubId: "c", kind: "rya", catalogueId: 303 }, existing, catalogue) as BoatClass;
  assert.deepEqual(noPn.handicaps, []);
});

test("buildClubClass refuses unknown, local-catalogue and duplicate RYA classes", () => {
  assert.match(buildClubClass({ clubId: "c", kind: "rya", catalogueId: 999 }, existing, catalogue) as string, /not in the RYA list/);
  assert.match(buildClubClass({ clubId: "c", kind: "rya", catalogueId: -4 }, existing, catalogue) as string, /not in the RYA list/);
  const withIlca = [...existing, { id: "ILCA 7", name: "ILCA 7", catalogueId: 191, handicaps: [] }];
  assert.match(buildClubClass({ clubId: "c", kind: "rya", catalogueId: 191 }, withIlca, catalogue) as string, /already/);
});

test("buildClubClass builds local classes with unique ids", () => {
  const c = buildClubClass({ clubId: "c", kind: "local", name: "  Dory  Junior ", isSinglehander: true }, existing, catalogue);
  assert.deepEqual(c, { id: "local-dory-junior", name: "Dory Junior", kind: "local", isSinglehander: true, handicaps: [] });
  const clash = [...existing, { id: "local-dory-2", name: "Other", handicaps: [] }];
  assert.equal((buildClubClass({ clubId: "c", kind: "local", name: "Dory!" }, clash, catalogue) as BoatClass).id, "local-dory-3");
});

test("buildClubClass refuses local classes clashing with club or RYA names", () => {
  assert.match(buildClubClass({ clubId: "c", kind: "local", name: "topper" }, existing, catalogue) as string, /already has/);
  assert.match(buildClubClass({ clubId: "c", kind: "local", name: "ilca 7" }, existing, catalogue) as string, /RYA list/);
  assert.match(buildClubClass({ clubId: "c", kind: "local", name: "   " }, existing, catalogue) as string, /Enter/);
});

test("localClassId slugs names", () => {
  assert.equal(localClassId("Rooster 8.1"), "local-rooster-8-1");
  assert.equal(localClassId("!!"), "local-class");
});
