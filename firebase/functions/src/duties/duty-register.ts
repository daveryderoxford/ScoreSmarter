import { onCall, HttpsError } from "firebase-functions/v2/https";
import type { DutyMember } from "@shared/duty-member";
import { fetchDutyTeam, postDutyAttendance } from "./island-barn-duty-api.js";

function requireApiKey(): string {
  const apiKey = process.env.ISLAND_BARN_DUTY_API_KEY;
  if (!apiKey) {
    throw new HttpsError("internal", "Server configuration missing duty register credentials.");
  }
  return apiKey;
}

export const getDutyTeamForDay = onCall(
  {
    enforceAppCheck: true,
    secrets: ["ISLAND_BARN_DUTY_API_KEY"],
    region: "europe-west1",
  },
  async (request): Promise<{ duties: DutyMember[] | null }> => {
    const date = request.data?.date;
    if (date !== undefined && typeof date !== "string") {
      throw new HttpsError("invalid-argument", "date must be a string when provided.");
    }

    try {
      const duties = await fetchDutyTeam(requireApiKey(), date);
      return { duties };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("getDutyTeamForDay: fetch failed", message);
      throw new HttpsError("internal", "Failed to load duty team.");
    }
  },
);

export const setDutyAttendance = onCall(
  {
    enforceAppCheck: true,
    secrets: ["ISLAND_BARN_DUTY_API_KEY"],
    region: "europe-west1",
  },
  async (request): Promise<{ success: true }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to update duty attendance.");
    }

    const key = request.data?.key;
    const attending = request.data?.attending;
    if (typeof key !== "string" || !key.trim()) {
      throw new HttpsError("invalid-argument", "key is required.");
    }
    if (typeof attending !== "boolean") {
      throw new HttpsError("invalid-argument", "attending must be a boolean.");
    }

    try {
      await postDutyAttendance(requireApiKey(), key, attending);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("setDutyAttendance: update failed", message);
      throw new HttpsError("internal", "Failed to update duty attendance.");
    }
  },
);
