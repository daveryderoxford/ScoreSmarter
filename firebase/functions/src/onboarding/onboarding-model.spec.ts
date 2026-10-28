import test from "node:test";
import * as assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { adminJoinedFields, newClubDoc, shouldGrantFirstAdmin } from "./onboarding-model.js";

const onboarding = { adminEmail: "sec@westbay.org" };

test("shouldGrantFirstAdmin grants a verified matching email, ignoring case and spaces", () => {
  assert.equal(shouldGrantFirstAdmin(onboarding, { email: " Sec@WestBay.org ", email_verified: true }), true);
});

test("shouldGrantFirstAdmin refuses unverified, different or missing emails", () => {
  assert.equal(shouldGrantFirstAdmin(onboarding, { email: "sec@westbay.org", email_verified: false }), false);
  assert.equal(shouldGrantFirstAdmin(onboarding, { email: "sec@westbay.org" }), false);
  assert.equal(shouldGrantFirstAdmin(onboarding, { email: "other@westbay.org", email_verified: true }), false);
  assert.equal(shouldGrantFirstAdmin(onboarding, { email_verified: true }), false);
});

test("shouldGrantFirstAdmin refuses once claimed, or when the club has no onboarding record", () => {
  const claimed = { ...onboarding, claimedBy: "uid-1" };
  assert.equal(shouldGrantFirstAdmin(claimed, { email: "sec@westbay.org", email_verified: true }), false);
  assert.equal(shouldGrantFirstAdmin(undefined, { email: "sec@westbay.org", email_verified: true }), false);
});

test("newClubDoc has the arrays ClubStore requires, PY handicaps and is awaiting its admin", () => {
  const startedAt = Timestamp.fromMillis(1_790_000_000_000);
  const club = newClubDoc({ contactName: " Sam Sec ", contactEmail: " sec@westbay.org " }, " West Bay SC ", startedAt);
  assert.deepEqual(club, {
    name: "West Bay SC",
    contactName: "Sam Sec",
    contactEmail: "sec@westbay.org",
    fleets: [],
    classes: [],
    seasons: [],
    supportedHandicapSchemes: ["PY"],
    onboardingStatus: "awaiting-admin",
    onboardingStartedAt: startedAt,
  });
});

test("adminJoinedFields moves the club on to setting up", () => {
  const joinedAt = Timestamp.fromMillis(1_790_000_000_000);
  assert.deepEqual(adminJoinedFields(joinedAt), { onboardingStatus: "setting-up", adminJoinedAt: joinedAt });
});
