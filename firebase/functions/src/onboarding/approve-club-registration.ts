import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { assertAuthenticated, isSysAdmin } from "../shared/authorisation.js";
import { clubIdProblem } from "../shared/club-id.js";
import { detailedHttpsError } from "../shared/https-error.js";
import { POSTMARK_SECRET, sendEmail } from "../shared/postmark.js";
import { clubApprovedEmail } from "./onboarding-emails.js";
import {
  CLUB_REGISTRATIONS,
  clubUrl,
  newClubDoc,
  normaliseEmail,
  onboardingPath,
  type ClubRegistration,
} from "./onboarding-model.js";

interface ApproveRequest {
  registrationId: string;
  /** Defaults to the requested subdomain. */
  clubId?: string;
  /** Defaults to the requested club name. */
  clubName?: string;
}

/**
 * Sys-admin: creates the club for a registration and records its contact email, so the
 * first user to sign in with that verified email becomes club admin (see ensureUserData),
 * then emails the contact. Safe to retry once approved.
 */
export const approveClubRegistration = onCall<ApproveRequest>({ secrets: [POSTMARK_SECRET] }, async request => {
  assertAuthenticated(request.auth);
  if (!isSysAdmin(request.auth.token)) {
    throw detailedHttpsError("permission-denied", "Only a system administrator can approve clubs.", {
      stage: "assert_permissions",
    });
  }
  const { registrationId } = request.data ?? {};
  if (!registrationId || typeof registrationId !== "string") {
    throw detailedHttpsError("invalid-argument", "registrationId is required.", { stage: "validate_input" });
  }

  const uid = request.auth.uid;
  const db = getFirestore();
  const registrationRef = db.doc(`${CLUB_REGISTRATIONS}/${registrationId}`);

  const approved = await db.runTransaction(async tx => {
    const registrationSnap = await tx.get(registrationRef);
    if (!registrationSnap.exists) {
      throw detailedHttpsError("not-found", "Registration not found.", { stage: "load_registration" });
    }
    const registration = registrationSnap.data() as ClubRegistration;
    const clubId = (request.data.clubId ?? registration.subdomain).trim().toLowerCase();
    const clubName = (request.data.clubName ?? registration.clubName).trim();

    if (registration.status === "approved" && registration.clubId === clubId) {
      return { registration, clubId, clubName: registration.clubName };
    }
    if (registration.status !== "new") {
      throw detailedHttpsError("failed-precondition", `This registration is already ${registration.status}.`, {
        stage: "check_status",
      });
    }
    const problem = clubIdProblem(clubId);
    if (problem) {
      throw detailedHttpsError("invalid-argument", `Club id "${clubId}" ${problem}.`, { stage: "validate_club_id" });
    }
    if (!clubName) {
      throw detailedHttpsError("invalid-argument", "Club name is required.", { stage: "validate_input" });
    }

    const clubRef = db.doc(`clubs/${clubId}`);
    if ((await tx.get(clubRef)).exists) {
      throw detailedHttpsError("failed-precondition", `A club with id "${clubId}" already exists.`, {
        stage: "check_club_id",
      });
    }

    tx.create(clubRef, newClubDoc(registration, clubName));
    tx.create(db.doc(onboardingPath(clubId)), {
      adminEmail: normaliseEmail(registration.contactEmail),
      registrationId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(registrationRef, {
      status: "approved",
      clubId,
      approvedBy: uid,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { registration, clubId, clubName };
  });

  const { registration, clubId, clubName } = approved;
  let emailSent = registration.emailsSent?.approved === true;
  if (!emailSent) {
    emailSent = await sendEmail(clubApprovedEmail(registration, clubId, clubName));
    if (emailSent) await registrationRef.update({ "emailsSent.approved": true });
  }
  logger.info("approveClubRegistration: club created", { registrationId, clubId, emailSent });
  return { clubId, clubUrl: clubUrl(clubId), emailSent };
});
