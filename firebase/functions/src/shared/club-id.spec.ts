import test from "node:test";
import * as assert from "node:assert/strict";
import { clubIdProblem } from "./club-id.js";

test("clubIdProblem accepts lowercase DNS labels of 3 to 12 characters", () => {
  for (const id of ["ibrsc", "bwsc", "west-bay", "club-1", "abc", "abcdefghijkl"]) {
    assert.equal(clubIdProblem(id), undefined, id);
  }
});

test("clubIdProblem rejects bad lengths, characters and hyphens", () => {
  assert.match(clubIdProblem("ab")!, /3 to 12/);
  assert.match(clubIdProblem("abcdefghijklm")!, /3 to 12/);
  for (const id of ["West", "west_bay", "west bay", "-west", "west-", "we--st", "wést"]) {
    assert.match(clubIdProblem(id)!, /lowercase/, id);
  }
});

test("clubIdProblem rejects reserved host labels", () => {
  for (const id of ["www", "auth", "admin", "scoresmarter"]) {
    assert.equal(clubIdProblem(id), "is reserved", id);
  }
});
