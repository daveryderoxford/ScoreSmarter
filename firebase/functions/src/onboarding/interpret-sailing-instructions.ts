import { randomUUID } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import {
  parseSystemScanAiConfig,
  resolveScanModelParams,
  SCAN_AI_CONFIG_PATH,
} from "../scoring-sheet-scanner/ai-scan-model.js";
import { assertAuthenticated, assertCallerRole } from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";
import { assertInstructionText, readSailingInstructions } from "./sailing-instruction-reading.js";

export const interpretSailingInstructions = onCall({
  memory: "512MiB",
  timeoutSeconds: 120,
}, async (request) => {
  const requestId = randomUUID();
  assertAuthenticated(request.auth, { requestId });

  const data = request.data as { clubId?: unknown; text?: unknown };
  const clubId = typeof data.clubId === "string" ? data.clubId.trim() : "";
  if (!clubId) {
    throw detailedHttpsError("invalid-argument", "Missing clubId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_club_id",
    });
  }
  assertCallerRole("club-admin", request.auth, clubId);
  const text = assertInstructionText(data.text, requestId);

  let system = parseSystemScanAiConfig(undefined);
  try {
    const snap = await getFirestore().doc(SCAN_AI_CONFIG_PATH).get();
    system = parseSystemScanAiConfig(snap.exists ? snap.data() : undefined);
  } catch {
    system = parseSystemScanAiConfig(undefined);
  }

  return readSailingInstructions(
    text,
    resolveScanModelParams(system, undefined, undefined, false),
    requestId,
  );
});
