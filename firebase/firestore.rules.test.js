import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(__dirname, 'firestore.rules'), 'utf8');

const PROJECT_ID = 'scoresmarter-rules-test';
const CLUB_ID = 'testclub';
const SYS_ADMIN_UID = 'Uw4HKGlcHla1Fm8Zw8B7DBVyl1j1';
const RO_UID = 'race-officer-user';
const USER_UID = 'regular-user';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment | undefined} */
let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
});

test.after(async () => {
  await testEnv?.cleanup();
});

function authedDb(uid, claims = {}) {
  return testEnv
    .authenticatedContext(uid, claims)
    .firestore();
}

function clubUserClaims(role) {
  return { clubs: { [CLUB_ID]: role } };
}

test('sys-admin UID fallback can read scan metrics', async () => {
  const db = authedDb(SYS_ADMIN_UID);
  await assertSucceeds(
    db.doc(`system/private/scans/scan-1`).get(),
  );
});

test('non-admin cannot read scan metrics', async () => {
  const db = authedDb(USER_UID, clubUserClaims('user'));
  await assertFails(
    db.doc(`system/private/scans/scan-1`).get(),
  );
});

test('race officer can write published_series race doc', async () => {
  const db = authedDb(RO_UID, clubUserClaims('race-officer'));
  await assertSucceeds(
    db.doc(`clubs/${CLUB_ID}/published_series/series-1/races/race-1`).set({
      index: 1,
      scheduledStart: new Date(),
      extraField: 'allowed',
    }),
  );
});

test('boat create allows extra optional fields when required fields present', async () => {
  const db = authedDb(USER_UID, clubUserClaims('user'));
  await assertSucceeds(
    db.doc(`clubs/${CLUB_ID}/boats/boat-1`).set({
      name: 'Laser 1',
      ownerUid: USER_UID,
      class: 'ILCA 7',
      tags: ['gold'],
    }),
  );
});

test('boat create fails when required fields missing', async () => {
  const db = authedDb(USER_UID, clubUserClaims('user'));
  await assertFails(
    db.doc(`clubs/${CLUB_ID}/boats/boat-2`).set({
      name: 'No owner',
    }),
  );
});

test('race result update rejects raceId mutation', async () => {
  const path = `clubs/${CLUB_ID}/race-results/comp-1`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set({
      raceId: 'race-a',
      seriesId: 'series-1',
      seriesEntryId: 'entry-1',
    });
  });

  const db = authedDb(USER_UID, clubUserClaims('user'));
  await assertFails(
    db.doc(path).set({
      raceId: 'race-b',
      seriesId: 'series-1',
      seriesEntryId: 'entry-1',
    }),
  );
});

test('club-admin can read authorized_kiosks', async () => {
  const path = `clubs/${CLUB_ID}/authorized_kiosks/device-1`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set({
      deviceId: 'device-1',
      status: 'active',
      authUid: 'kiosk_device_1',
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    });
  });

  const adminDb = authedDb('club-admin-user', clubUserClaims('club-admin'));
  await assertSucceeds(adminDb.doc(path).get());
});

test('regular user cannot read authorized_kiosks', async () => {
  const path = `clubs/${CLUB_ID}/authorized_kiosks/device-2`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set({
      deviceId: 'device-2',
      status: 'active',
      authUid: 'kiosk_device_2',
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    });
  });

  const db = authedDb(USER_UID, clubUserClaims('user'));
  await assertFails(db.doc(path).get());
});

test('client cannot write authorized_kiosks even as club-admin', async () => {
  const path = `clubs/${CLUB_ID}/authorized_kiosks/device-3`;
  const adminDb = authedDb('club-admin-user', clubUserClaims('club-admin'));
  await assertFails(
    adminDb.doc(path).set({
      deviceId: 'device-3',
      status: 'active',
      authUid: 'kiosk_device_3',
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    }),
  );
});

test('unauthenticated cannot read authorized_kiosks', async () => {
  const path = `clubs/${CLUB_ID}/authorized_kiosks/device-4`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set({
      deviceId: 'device-4',
      status: 'active',
      authUid: 'kiosk_device_4',
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    });
  });

  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.doc(path).get());
});

test('club user owner can update profile but not role', async () => {
  const path = `clubs/${CLUB_ID}/users/${USER_UID}`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set({
      role: 'user',
      tenantId: CLUB_ID,
      firstname: 'Ada',
      surname: 'Lovelace',
    });
  });

  const db = authedDb(USER_UID, clubUserClaims('user'));
  await assertSucceeds(
    db.doc(path).set({
      role: 'user',
      tenantId: CLUB_ID,
      firstname: 'Augusta',
      surname: 'Lovelace',
    }),
  );
  await assertFails(
    db.doc(path).set({
      role: 'race-officer',
      tenantId: CLUB_ID,
      firstname: 'Augusta',
      surname: 'Lovelace',
    }),
  );
});

test('user cannot create their own club user doc with a role other than user', async () => {
  const db = authedDb('new-user', clubUserClaims('user'));
  const profile = { tenantId: CLUB_ID, firstname: 'New', surname: 'User' };
  await assertFails(db.doc(`clubs/${CLUB_ID}/users/new-user`).set({ ...profile, role: 'club-admin' }));
  await assertSucceeds(db.doc(`clubs/${CLUB_ID}/users/new-user`).set({ ...profile, role: 'user' }));
});

function registration(id, overrides = {}) {
  const now = firebase.firestore.FieldValue.serverTimestamp();
  return {
    id,
    clubName: 'West Bay SC',
    subdomain: 'westbay',
    contactName: 'Sam Secretary',
    contactEmail: 'sec@westbay.org',
    status: 'new',
    source: 'home-site',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('anyone can submit a valid club registration', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(db.doc('club-registrations/reg-ok').set(registration('reg-ok')));
});

test('club registration rejects bad subdomains, emails, statuses and extra fields', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const bad = [
    { subdomain: 'West Bay' },
    { subdomain: 'ab' },
    { subdomain: 'abcdefghijklm' },
    { contactEmail: 'not-an-email' },
    { status: 'approved' },
    { clubId: 'westbay' },
    { createdAt: new Date(2020, 0, 1) },
  ];
  for (const [i, overrides] of bad.entries()) {
    await assertFails(db.doc(`club-registrations/reg-bad-${i}`).set(registration(`reg-bad-${i}`, overrides)));
  }
  await assertFails(db.doc('club-registrations/reg-x').set(registration('reg-other-id')));
});

test('only sys-admins can read registrations, and may only reject or reopen them', async () => {
  const path = 'club-registrations/reg-review';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set({ ...registration('reg-review'), createdAt: new Date(), updatedAt: new Date() });
  });
  const now = firebase.firestore.FieldValue.serverTimestamp();

  await assertFails(testEnv.unauthenticatedContext().firestore().doc(path).get());
  await assertFails(authedDb(USER_UID, clubUserClaims('club-admin')).doc(path).get());

  const admin = authedDb(SYS_ADMIN_UID);
  await assertSucceeds(admin.doc(path).get());
  await assertFails(admin.doc(path).update({ status: 'approved', updatedAt: now }));
  await assertFails(admin.doc(path).update({ clubId: 'westbay', updatedAt: now }));
  await assertSucceeds(admin.doc(path).update({ status: 'rejected', notes: 'Duplicate', updatedAt: now }));
});

const topper = { id: 'rya-379', name: 'Topper', kind: 'rya', catalogueId: 379, handicaps: [{ scheme: 'PY', value: 1369 }] };
const dory = { id: 'local-dory', name: 'Dory', kind: 'local', isSinglehander: false, handicaps: [] };

async function seedClubClasses() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`clubs/${CLUB_ID}`).set({ name: 'Test club', classes: [topper] });
  });
}

test('race officer can append one class to the club list', async () => {
  await seedClubClasses();
  const db = authedDb(RO_UID, clubUserClaims('race-officer'));
  await assertSucceeds(
    db.doc(`clubs/${CLUB_ID}`).set({ classes: firebase.firestore.FieldValue.arrayUnion(dory) }, { merge: true }),
  );
});

test('race officer cannot edit, remove or reorder classes, or change other club fields', async () => {
  await seedClubClasses();
  const club = authedDb(RO_UID, clubUserClaims('race-officer')).doc(`clubs/${CLUB_ID}`);
  await assertFails(club.update({ classes: [{ ...topper, handicaps: [] }] }));
  await assertFails(club.update({ classes: [] }));
  await assertFails(club.update({ classes: [dory, topper] }));
  await assertFails(club.update({ classes: [topper, dory], name: 'Renamed' }));
  await assertFails(club.update({ classes: [topper, { ...dory, kind: 'other' }] }));
  await assertFails(club.update({ classes: [topper, { ...dory, extra: true }] }));
});

test('kiosk and regular users cannot add classes', async () => {
  await seedClubClasses();
  const append = { classes: firebase.firestore.FieldValue.arrayUnion(dory) };
  const kiosk = authedDb('kiosk_device_1', { ...clubUserClaims('race-officer'), kiosk: true });
  await assertFails(kiosk.doc(`clubs/${CLUB_ID}`).set(append, { merge: true }));
  const user = authedDb(USER_UID, clubUserClaims('user'));
  await assertFails(user.doc(`clubs/${CLUB_ID}`).set(append, { merge: true }));
});
