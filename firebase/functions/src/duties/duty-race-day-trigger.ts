import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import type { RaceDay } from "@shared/race-day";
import { postDutyAttendance } from "./island-barn-duty-api.js";
import {
  newlyConfirmedKeys,
  shouldConfirmWithIslandBarn,
} from "./duty-race-day.js";

function requireApiKey(): string {
  const apiKey = process.env.ISLAND_BARN_DUTY_API_KEY;
  if (!apiKey) {
    throw new Error("Server configuration missing duty register credentials.");
  }
  return apiKey;
}

/**
 * When an IBRSC race-day member newly becomes `confirmed`, POST Island Barn
 * attendance. Client writes status directly; this trigger owns the IB side-effect.
 */
export const raceDayDutyConfirmed = onDocumentUpdated(
  {
    document: "clubs/{clubId}/race-days/{date}",
    region: "europe-west1",
    secrets: ["ISLAND_BARN_DUTY_API_KEY"],
  },
  async (event) => {
    const clubId = event.params.clubId;
    if (!shouldConfirmWithIslandBarn(clubId)) return;
    if (!event.data) return;

    const before = event.data.before.data() as RaceDay | undefined;
    const after = event.data.after.data() as RaceDay | undefined;
    if (!before?.dutyTeam || !after?.dutyTeam) return;

    const keys = newlyConfirmedKeys(before.dutyTeam, after.dutyTeam);
    if (keys.length === 0) return;

    const apiKey = requireApiKey();
    for (const key of keys) {
      try {
        await postDutyAttendance(apiKey, key, true);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("raceDayDutyConfirmed: Island Barn POST failed", { clubId, key, message });
        throw error;
      }
    }
  },
);
