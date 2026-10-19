import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  NOT_FINISHED,
  raceLifecycleUpdate,
  raceStatusFromCounts,
  racesToRecompute,
  type ComputedRaceStatus,
  type RaceLifecycleFields,
} from "./race-lifecycle.js";

/**
 * Keeps a race's status (Future / In progress / Completed) in step with its results,
 * whichever client path wrote them, and returns final results to provisional when
 * they change.
 *
 * Cost: one race read per affected race, plus two count aggregations only when an
 * entry is added, removed or moves to/from NOT FINISHED. The race is written only
 * when its status or results state actually changes.
 */
export const raceResultsChanged = onDocumentWritten(
  {
    document: "clubs/{clubId}/race-results/{resultId}",
    region: "europe-west1",
  },
  async (event) => {
    const clubId = event.params.clubId;
    const affected = racesToRecompute(event.data?.before.data(), event.data?.after.data());
    if (affected.length === 0) return;

    const db = getFirestore();
    for (const { raceId, recomputeStatus } of affected) {
      await syncRace(db, clubId, raceId, recomputeStatus);
    }
  },
);

async function syncRace(db: Firestore, clubId: string, raceId: string, recomputeStatus: boolean): Promise<void> {
  const raceRef = db.doc(`clubs/${clubId}/races/${raceId}`);
  const raceSnap = await raceRef.get();
  if (!raceSnap.exists) return;
  const race = raceSnap.data() as RaceLifecycleFields;
  if (race.status === "Canceled") return;
  if (!recomputeStatus && race.resultsState !== "final") return;

  const nextStatus = recomputeStatus ? await statusFromCounts(db, clubId, raceId) : undefined;
  const update = raceLifecycleUpdate(race, nextStatus);
  if (!update) return;

  await raceRef.update(update);
  logger.info("raceResultsChanged: race updated", { clubId, raceId, ...update });
}

/** Two count aggregations (about one read each) instead of reading every result. */
async function statusFromCounts(db: Firestore, clubId: string, raceId: string): Promise<ComputedRaceStatus> {
  const raceResults = db.collection(`clubs/${clubId}/race-results`).where("raceId", "==", raceId);
  const [entries, notFinished] = await Promise.all([
    raceResults.count().get(),
    raceResults.where("resultCode", "==", NOT_FINISHED).count().get(),
  ]);
  return raceStatusFromCounts(entries.data().count, notFinished.data().count);
}
