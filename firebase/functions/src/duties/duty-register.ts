import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { RaceDay } from "@shared/race-day";
import { fetchDutyTeam } from "./island-barn-duty-api.js";
import {
  IBRSC_CLUB_ID,
  raceDayDateId,
  syncRaceDayDocument,
  type RaceDayStore,
} from "./duty-race-day.js";

function requireApiKey(): string {
  const apiKey = process.env.ISLAND_BARN_DUTY_API_KEY;
  if (!apiKey) {
    throw new Error("Server configuration missing duty register credentials.");
  }
  return apiKey;
}

function firestoreRaceDayStore(): RaceDayStore {
  const db = getFirestore();
  return {
    async get(path) {
      const snap = await db.doc(path).get();
      return snap.exists ? (snap.data() as RaceDay) : undefined;
    },
    async set(path, data) {
      await db.doc(path).set(data);
    },
  };
}

/** Copies today's IBRSC duty team from the Island Barn duty register into Firestore. */
export const syncIbrscDutyTeamDaily = onSchedule(
  {
    schedule: "every day 05:00",
    timeZone: "Europe/London",
    region: "europe-west1",
    secrets: ["ISLAND_BARN_DUTY_API_KEY"],
    retryCount: 3,
  },
  async () => {
    const dateId = raceDayDateId();
    const apiKey = requireApiKey();
    // Errors propagate so Cloud Scheduler retries (e.g. Island Barn briefly unavailable).
    const result = await syncRaceDayDocument({
      store: firestoreRaceDayStore(),
      clubId: IBRSC_CLUB_ID,
      dateId,
      fetchIslandBarnTeam: () => fetchDutyTeam(apiKey, dateId),
    });
    logger.info("syncIbrscDutyTeamDaily: complete", result);
  },
);
