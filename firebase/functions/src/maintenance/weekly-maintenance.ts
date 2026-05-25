import { getFirestore, Timestamp, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const WRITE_BATCH_LIMIT = 500;

interface ClubMaintenanceStats {
  staleFutureRacesCanceled: number;
}

/** Scheduled weekly job that runs every Monday and sets races over 2 weeks old 
 * that still have a status if 'Future' as 'Canceled'. 
*/
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

  return { staleFutureRacesCanceled };
}
