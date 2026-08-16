import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { RaceDay } from "@shared/race-day";
import { fetchDutyTeam } from "./island-barn-duty-api.js";
import {
  ensureRaceDayDocument,
  raceDayDateId,
  type RaceDayStore,
} from "./duty-race-day.js";
import { validateClubId } from "../kiosk/kiosk-auth.js";

function requireApiKey(): string {
  const apiKey = process.env.ISLAND_BARN_DUTY_API_KEY;
  if (!apiKey) {
    throw new HttpsError("internal", "Server configuration missing duty register credentials.");
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

const callableOptions = {
  enforceAppCheck: true,
  secrets: ["ISLAND_BARN_DUTY_API_KEY"],
  region: "europe-west1" as const,
};

export const ensureRaceDay = onCall(
  callableOptions,
  async (request): Promise<{ date: string; created: boolean }> => {
    let clubId: string;
    try {
      clubId = validateClubId(request.data?.clubId);
    } catch {
      throw new HttpsError("invalid-argument", "clubId is required.");
    }

    const rawDate = request.data?.date;
    if (rawDate !== undefined && typeof rawDate !== "string") {
      throw new HttpsError("invalid-argument", "date must be a string when provided.");
    }

    let dateId: string;
    try {
      dateId = raceDayDateId(rawDate);
    } catch {
      throw new HttpsError("invalid-argument", "date must be yyyy-mm-dd.");
    }

    try {
      return await ensureRaceDayDocument({
        store: firestoreRaceDayStore(),
        clubId,
        dateId,
        fetchIslandBarnTeam: () => fetchDutyTeam(requireApiKey(), rawDate),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("ensureRaceDay: failed", message);
      throw new HttpsError("internal", "Failed to load race day.");
    }
  },
);
