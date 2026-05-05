import { getFirestore, Timestamp, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const WRITE_BATCH_LIMIT = 500;

interface ClubMaintenanceStats {
  orphanSeriesEntriesDeleted: number;
  staleFutureRacesCanceled: number;
}

export const cleanupOrphanSeriesEntriesWeekly = onSchedule(
  {
    schedule: "every tuesday 13:30",
    timeZone: "Europe/London",
    memory: "512MiB",
    timeoutSeconds: 540,
    retryCount: 0,
  },
  async () => {
    const db = getFirestore();
    const clubRefs = await db.collection("clubs").listDocuments();

    logger.info(`cleanupOrphanSeriesEntriesWeekly: processing ${clubRefs.length} club(s)`);

    for (const clubRef of clubRefs) {
      try {
        const stats = await cleanupOrphanSeriesEntriesForClub(db, clubRef.id);
        logger.info("cleanupOrphanSeriesEntriesWeekly: club complete", {
          clubId: clubRef.id,
          orphanSeriesEntriesDeleted: stats.orphanSeriesEntriesDeleted,
        });
      } catch (err) {
        logger.error("cleanupOrphanSeriesEntriesWeekly: club failed", {
          clubId: clubRef.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },
);

export const cancelStaleFutureRacesWeekly = onSchedule(
  {
    schedule: "every monday 03:10",
    timeZone: "Europe/London",
    memory: "512MiB",
    timeoutSeconds: 540,
    retryCount: 0,
  },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - TWO_WEEKS_MS);
    const clubRefs = await db.collection("clubs").listDocuments();

    logger.info(`cancelStaleFutureRacesWeekly: processing ${clubRefs.length} club(s)`);

    for (const clubRef of clubRefs) {
      try {
        const stats = await cancelStaleFutureRacesForClub(db, clubRef.id, cutoff);
        logger.info("cancelStaleFutureRacesWeekly: club complete", {
          clubId: clubRef.id,
          staleFutureRacesCanceled: stats.staleFutureRacesCanceled,
        });
      } catch (err) {
        logger.error("cancelStaleFutureRacesWeekly: club failed", {
          clubId: clubRef.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },
);

async function cleanupOrphanSeriesEntriesForClub(db: Firestore, clubId: string): Promise<ClubMaintenanceStats> {
  
  // Read all series entries for club - This does not scale going forwards. 
  // Move to adding a trigger when a race competitor is deleted. 
  const seriesEntriesSnapshot = await db.collection(`clubs/${clubId}/series-entries`).get();

  let batch = db.batch();
  let writeCount = 0;
  let orphanSeriesEntriesDeleted = 0;

  const queueWrite = async (mutator: (b: WriteBatch) => void): Promise<void> => {
    if (writeCount === WRITE_BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      writeCount = 0;
    }
    mutator(batch);
    writeCount++;
  };

  for (const entryDoc of seriesEntriesSnapshot.docs) {
    const hasCompetitorSnapshot = await db
      .collection(`clubs/${clubId}/race-results`)
      .where("seriesEntryId", "==", entryDoc.id)
      .limit(1)
      .get();

    if (hasCompetitorSnapshot.empty) {
      orphanSeriesEntriesDeleted++;
      await queueWrite(b => b.delete(entryDoc.ref));
    }
  }

  if (writeCount > 0) {
    await batch.commit();
  }

  return { orphanSeriesEntriesDeleted, staleFutureRacesCanceled: 0 };
}

async function cancelStaleFutureRacesForClub(db: Firestore, clubId: string, cutoff: Timestamp): Promise<ClubMaintenanceStats> {
  const staleFutureRacesSnapshot = await db
    .collection(`clubs/${clubId}/races`)
    .where("status", "==", "Future")
    .where("scheduledStart", "<", cutoff)
    .get();

  let batch = db.batch();
  let writeCount = 0;
  let staleFutureRacesCanceled = 0;

  const queueWrite = async (mutator: (b: WriteBatch) => void): Promise<void> => {
    if (writeCount === WRITE_BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      writeCount = 0;
    }
    mutator(batch);
    writeCount++;
  };

  for (const raceDoc of staleFutureRacesSnapshot.docs) {
    const hasCompetitorSnapshot = await db
      .collection(`clubs/${clubId}/race-results`)
      .where("raceId", "==", raceDoc.id)
      .limit(1)
      .get();

    if (hasCompetitorSnapshot.empty) {
      staleFutureRacesCanceled++;
      await queueWrite(b => b.update(raceDoc.ref, { status: "Canceled" }));
    }
  }

  if (writeCount > 0) {
    await batch.commit();
  }

  return { orphanSeriesEntriesDeleted: 0, staleFutureRacesCanceled };
}
