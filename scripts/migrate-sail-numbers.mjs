/**
 * Migrates legacy numeric `sailNumber` fields to canonical strings in
 * `boats` and `series-entries` collections.
 *
 * Usage:
 *   node scripts/migrate-sail-numbers.mjs --dry-run
 *   node scripts/migrate-sail-numbers.mjs --club-id <tenantClubId>
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const clubIdx = args.indexOf('--club-id');
const clubId = clubIdx >= 0 ? args[clubIdx + 1] : undefined;

initializeApp();
const db = getFirestore();

function normalizeSailNumber(raw) {
  if (raw == null) return '';
  let text;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return '';
    text = String(Math.trunc(raw));
  } else {
    text = String(raw);
  }
  const compact = text.trim().replace(/\s+/g, '');
  if (!compact) return '';
  const digitIndex = compact.search(/\d/);
  if (digitIndex < 0) return compact.toUpperCase();
  return compact.slice(0, digitIndex).toUpperCase() + compact.slice(digitIndex);
}

async function migrateCollection(collectionPath) {
  const snap = await db.collection(collectionPath).get();
  let numeric = 0;
  let alreadyString = 0;
  let invalid = 0;
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;

  async function commitBatchIfNeeded(force = false) {
    if (batchCount === 0) return;
    if (force || batchCount >= 400) {
      if (!dryRun) await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  for (const doc of snap.docs) {
    const data = doc.data();
    const raw = data.sailNumber;
    if (raw == null) {
      invalid++;
      continue;
    }
    const normalized = normalizeSailNumber(raw);
    if (!normalized) {
      invalid++;
      console.warn(`  missing sailNumber on ${collectionPath}/${doc.id}`);
      continue;
    }
    if (typeof raw === 'string' && raw === normalized) {
      alreadyString++;
      continue;
    }
    if (typeof raw === 'number') numeric++;
    else alreadyString++;

    if (!dryRun) {
      batch.update(doc.ref, { sailNumber: normalized });
      batchCount++;
      await commitBatchIfNeeded();
    }
    updated++;
  }

  await commitBatchIfNeeded(true);

  return { total: snap.size, numeric, alreadyString, invalid, updated };
}

async function main() {
  const prefix = clubId ? `clubs/${clubId}` : '';
  const targets = [
    `${prefix}/boats`.replace(/^\//, ''),
    `${prefix}/series-entries`.replace(/^\//, ''),
  ].filter(Boolean);

  if (clubId) {
    console.log(`Club-scoped migration for ${clubId}`);
  } else {
    console.log('Migrating root-level boats + series-entries (pass --club-id for tenant path)');
  }
  console.log(dryRun ? 'DRY RUN — no writes' : 'LIVE — writing strings');

  for (const path of targets) {
    console.log(`\n${path}`);
    try {
      const stats = await migrateCollection(path);
      console.log(stats);
    } catch (err) {
      console.error(`  skipped (${err.message})`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
