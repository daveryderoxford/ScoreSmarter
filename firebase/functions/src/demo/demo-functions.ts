import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { assertAuthenticated, isSysAdmin } from "../shared/authorisation.js";
import { resetDemoClub } from "./reset-demo.js";

const RESET_OPTIONS = { region: "europe-west1", memory: "1GiB", timeoutSeconds: 540 } as const;

/** Returns the demo club to its baseline every night, with a fresh training race for the day. */
export const resetDemoClubNightly = onSchedule(
  { ...RESET_OPTIONS, schedule: "every day 03:30", timeZone: "Europe/London", retryCount: 2 },
  async () => {
    await resetDemoClub();
  },
);

/** Sys-admin: reset the demo club now, e.g. before a training session. */
export const resetDemoClubNow = onCall(RESET_OPTIONS, async request => {
  assertAuthenticated(request.auth);
  if (!isSysAdmin(request.auth.token)) {
    throw new HttpsError("permission-denied", "Only a system administrator can reset the demo club.");
  }
  try {
    return await resetDemoClub();
  } catch (err) {
    logger.error("resetDemoClubNow failed", err);
    throw new HttpsError("internal", err instanceof Error ? err.message : "Demo reset failed");
  }
});
