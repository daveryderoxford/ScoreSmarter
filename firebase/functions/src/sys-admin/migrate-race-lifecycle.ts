import { getFirestore, type WriteBatch } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { NOT_FINISHED } from "../races/race-lifecycle.js";
import { assertAuthenticated, callerClaims, hasSysAdminRights } from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";
import { migratedRaceFields, type LegacyRaceStatus, type RaceResultCounts } from "./race-lifecycle-migration.js";

const WRITE_BATCH_LIMIT = 500;

interface ClubMigrationCounts {
  clubId: string;
  races: number;
  updated: number;
  /** Updates keyed by "<old status> -> <new status>/<results state>". */
  changes: Record<string, number>;
}

/**
 * One-time sys-admin migration of race documents to the reduced lifecycle
 * (legacy statuses mapped onto the new ones, statuses recalculated from results, and a
 * results state on every race). Only race documents are written; published results
 * are untouched. Pass `dryRun: true` to report counts without writing.
 */
export const migrateRaceLifecycle = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (request): Promise<{ dryRun: boolean; clubs: ClubMigrationCounts[] }> => {
    assertAuthenticated(request.auth);
    if (!hasSysAdminRights(callerClaims(request.auth))) {
      throw detailedHttpsError("permission-denied", "Only sys-admins can run this migration.", {
        stage: "assert_permissions",
        cause: "sys-admin",
      });
    }
    const dryRun = request.data?.dryRun !== false;

    const db = getFirestore();
    const clubRefs = await db.collection("clubs").listDocuments();
    const clubs: ClubMigrationCounts[] = [];

    for (const clubRef of clubRefs) {
      const clubId = clubRef.id;
      const races = await db.collection(`clubs/${clubId}/races`).get();
      const counts: ClubMigrationCounts = { clubId, races: races.size, updated: 0, changes: {} };

      // One read of the club's results (two fields only) gives every race's counts.
      const countsByRace = new Map<string, RaceResultCounts>();
      const results = await db.collection(`clubs/${clubId}/race-results`).select("raceId", "resultCode").get();
      for (const doc of results.docs) {
        const raceId = doc.get("raceId") as string | undefined;
        if (!raceId) continue;
        const counts = countsByRace.get(raceId) ?? { entries: 0, notFinished: 0 };
        counts.entries++;
        if (((doc.get("resultCode") as string | undefined) ?? NOT_FINISHED) === NOT_FINISHED) counts.notFinished++;
        countsByRace.set(raceId, counts);
      }

      let batch: WriteBatch = db.batch();
      let pending = 0;
      for (const doc of races.docs) {
        const status = doc.get("status") as LegacyRaceStatus;
        const update = migratedRaceFields(
          { status, resultsState: doc.get("resultsState") },
          countsByRace.get(doc.id) ?? { entries: 0, notFinished: 0 },
        );
        if (!update) continue;
        counts.updated++;
        const key = `${status} -> ${update.status}/${update.resultsState}`;
        counts.changes[key] = (counts.changes[key] ?? 0) + 1;
        if (dryRun) continue;
        batch.update(doc.ref, { ...update });
        if (++pending === WRITE_BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
      if (!dryRun && pending > 0) await batch.commit();

      logger.info("migrateRaceLifecycle: club processed", { dryRun, ...counts });
      clubs.push(counts);
    }

    return { dryRun, clubs };
  },
);
