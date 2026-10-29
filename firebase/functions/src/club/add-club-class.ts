import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { assertAuthenticated, assertCallerRole } from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";
import { buildClubClass, parseAddClubClassRequest, type BoatClass, type CatalogClass } from "./club-class.js";

/**
 * Adds a class to a club's class list: an RYA class built from the RYA list, or a local
 * class. Race officers can add classes (e.g. while entering a boat) but not edit them.
 */
export const addClubClass = onCall({ memory: "256MiB" }, async (request): Promise<BoatClass> => {
  assertAuthenticated(request.auth);
  const parsed = parseAddClubClassRequest(request.data);
  if (typeof parsed === "string") {
    throw detailedHttpsError("invalid-argument", parsed, { stage: "validate_input", cause: "bad_request" });
  }
  assertCallerRole("race-officer", request.auth, parsed.clubId);

  const db = getFirestore();
  const catalogueSnap = await db.doc("system/public/reference/classCatalogue").get();
  const catalogue = (catalogueSnap.get("classes") ?? []) as CatalogClass[];
  const clubRef = db.doc(`clubs/${parsed.clubId}`);

  return db.runTransaction(async tx => {
    const club = await tx.get(clubRef);
    if (!club.exists) {
      throw detailedHttpsError("not-found", "Club not found.", { stage: "load_club", clubId: parsed.clubId });
    }
    const classes = (club.get("classes") ?? []) as BoatClass[];
    const boatClass = buildClubClass(parsed, classes, catalogue);
    if (typeof boatClass === "string") {
      throw detailedHttpsError("invalid-argument", boatClass, { stage: "build_class", clubId: parsed.clubId });
    }
    tx.update(clubRef, { classes: [...classes, boatClass] });
    return boatClass;
  });
});
