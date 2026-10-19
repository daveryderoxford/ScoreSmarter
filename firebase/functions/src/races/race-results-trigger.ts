import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { NOT_FINISHED, raceLifecycleUpdate, type RaceLifecycleFields } from "./race-lifecycle.js";

/**
 * Keeps a race's status (Future / In progress / Completed) in step with its results,
 * whichever client path wrote them, and returns final results to provisional when
 * they change.
 */
export const raceResultsChanged = onDocumentWritten(
  {
    document: "clubs/{clubId}/race-results/{resultId}",
    region: "europe-west1",
  },
  async (event) => {
    const clubId = event.params.clubId;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const raceId = (after?.["raceId"] ?? before?.["raceId"]) as string | undefined;
    if (!raceId) return;

    const db = getFirestore();
    const raceRef = db.doc(`clubs/${clubId}/races/${raceId}`);
    const raceSnap = await raceRef.get();
    if (!raceSnap.exists) return;
    const race = raceSnap.data() as RaceLifecycleFields;

    const results = await db
      .collection(`clubs/${clubId}/race-results`)
      .where("raceId", "==", raceId)
      .get();
    const codes = results.docs.map((doc) => (doc.get("resultCode") as string | undefined) ?? NOT_FINISHED);

    const update = raceLifecycleUpdate(race, codes);
    if (!update) return;

    await raceRef.update(update);
    logger.info("raceResultsChanged: race updated", { clubId, raceId, ...update });
  },
);
