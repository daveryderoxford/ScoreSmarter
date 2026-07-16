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
