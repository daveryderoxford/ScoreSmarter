import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import { resultsSheetStoragePath } from "../scoring-sheet-scanner/image-upload/image-storage.js";
import {
  BASELINE_CLUB_FIELDS,
  BASELINE_FILE,
  CLEARED_COLLECTIONS,
  DEMO_CLUB_ID,
  RESET_STATE_DOC,
  RESTORED_COLLECTIONS,
  TRAINING_IMAGE_FILE,
  TRAINING_SHEET_FILE,
  decodeValue,
  planRestore,
  type DemoBaseline,
  type DocData,
} from "./demo-baseline.js";
import { buildTrainingDocs, TRAINING_SEASON, type TrainingSheet } from "./training-race.js";

export interface DemoResetSummary {
  rewritten: number;
  deleted: number;
  trainingRaceId?: string;
  trainingEntries: number;
}

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

async function readJson<T>(bucket: Bucket, path: string): Promise<T | undefined> {
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return undefined;
  const [contents] = await file.download();
  return JSON.parse(contents.toString("utf8")) as T;
}

/** Update times (ms) of every restorable demo doc, keyed by path relative to the club. */
async function existingDocs(db: Firestore): Promise<Map<string, number>> {
  const club = db.doc(`clubs/${DEMO_CLUB_ID}`);
  const existing = new Map<string, number>();
  for (const name of RESTORED_COLLECTIONS) {
    const snap = await club.collection(name).select().get();
    for (const doc of snap.docs) {
      existing.set(`${name}/${doc.id}`, doc.updateTime.toMillis());
      if (name === "published_series") {
        const races = await doc.ref.collection("races").select().get();
        races.docs.forEach(r => existing.set(`${name}/${doc.id}/races/${r.id}`, r.updateTime.toMillis()));
      }
    }
  }
  return existing;
}

/**
 * Returns the demo club to its baseline and sets up today's training race.
 * Only documents changed since the last reset are rewritten. Never touches any club
 * other than {@link DEMO_CLUB_ID}, nor the demo club's users or kiosks.
 */
export async function resetDemoClub(now = new Date()): Promise<DemoResetSummary> {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const club = db.doc(`clubs/${DEMO_CLUB_ID}`);

  const [clubSnap, baseline, sheet, stateSnap] = await Promise.all([
    club.get(),
    readJson<DemoBaseline>(bucket, BASELINE_FILE),
    readJson<TrainingSheet>(bucket, TRAINING_SHEET_FILE),
    db.doc(RESET_STATE_DOC).get(),
  ]);
  if (!clubSnap.exists) throw new Error(`clubs/${DEMO_CLUB_ID} does not exist`);
  if (!baseline) throw new Error(`No demo baseline at ${BASELINE_FILE}`);

  const lastReset = stateSnap.get("lastResetAt") as Timestamp | undefined;
  const baselineChanged = stateSnap.get("baselineCreatedAt") !== baseline.createdAt;
  const plan = planRestore(
    Object.keys(baseline.docs),
    await existingDocs(db),
    baselineChanged ? undefined : lastReset?.toMillis(),
  );

  const writer = db.bulkWriter();
  for (const path of plan.deletes) writer.delete(db.doc(`clubs/${DEMO_CLUB_ID}/${path}`));
  for (const path of plan.writes) {
    writer.set(db.doc(`clubs/${DEMO_CLUB_ID}/${path}`), decodeValue(baseline.docs[path]) as DocData);
  }
  await writer.close();
  for (const name of CLEARED_COLLECTIONS) await db.recursiveDelete(club.collection(name));

  const clubFields = Object.fromEntries(
    BASELINE_CLUB_FIELDS.filter(f => baseline.club[f] !== undefined).map(f => [f, decodeValue(baseline.club[f])]),
  ) as DocData;
  const seasons = (clubFields["seasons"] as DocData[] | undefined) ?? [];
  if (sheet && !seasons.some(s => s["id"] === TRAINING_SEASON.id)) {
    clubFields["seasons"] = [...seasons, { ...TRAINING_SEASON }];
  }
  await club.set(clubFields, { merge: true });

  const [sheetFiles] = await bucket.getFiles({ prefix: `clubs/${DEMO_CLUB_ID}/results-sheets/` });
  await Promise.all(sheetFiles.map(f => f.delete({ ignoreNotFound: true })));

  let training: ReturnType<typeof buildTrainingDocs> | undefined;
  if (sheet) {
    training = buildTrainingDocs(sheet, baseline, now);
    const imagePath = resultsSheetStoragePath(DEMO_CLUB_ID, training.raceId);
    const [hasImage] = await bucket.file(TRAINING_IMAGE_FILE).exists();
    if (hasImage) {
      await bucket.file(TRAINING_IMAGE_FILE).copy(bucket.file(imagePath));
      training.docs[`races/${training.raceId}`]["resultsSheetImage"] = imagePath;
    } else {
      logger.warn("resetDemoClub: no training sheet image", { file: TRAINING_IMAGE_FILE });
    }
    const trainingWriter = db.bulkWriter();
    for (const [path, data] of Object.entries(training.docs)) {
      trainingWriter.set(db.doc(`clubs/${DEMO_CLUB_ID}/${path}`), data);
    }
    await trainingWriter.close();
  } else {
    logger.info("resetDemoClub: no training sheet; skipping training race", { file: TRAINING_SHEET_FILE });
  }

  const summary: DemoResetSummary = {
    rewritten: plan.writes.length,
    deleted: plan.deletes.length,
    ...(training ? { trainingRaceId: training.raceId } : {}),
    trainingEntries: sheet?.rows.length ?? 0,
  };
  await db.doc(RESET_STATE_DOC).set({
    lastResetAt: Timestamp.now(),
    baselineCreatedAt: baseline.createdAt,
    ...summary,
  });
  logger.info("resetDemoClub: complete", summary);
  return summary;
}
