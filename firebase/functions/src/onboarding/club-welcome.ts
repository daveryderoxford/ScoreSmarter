import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import type { UserData } from "../model/user-data.js";
import { assertAuthenticated, isSysAdmin } from "../shared/authorisation.js";
import { clubIdProblem } from "../shared/club-id.js";
import { detailedHttpsError } from "../shared/https-error.js";
import { POSTMARK_SECRET, sendEmail } from "../shared/postmark.js";
import { makeUser } from "../user/user.js";
import { claimClubInTransaction, setClubAdminClaim } from "./claim-club.js";
import { clubApprovedEmail } from "./onboarding-emails.js";
import {
  CLUB_REGISTRATIONS,
  normaliseEmail,
  onboardingPath,
  welcomeUrl,
  type ClubOnboarding,
  type ClubRegistration,
} from "./onboarding-model.js";
import { checkWelcomeCode, issueWelcomeCode, type WelcomeCodeCheck } from "./welcome-code.js";

const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

interface WelcomeRequest {
  clubId: string;
  code: string;
}

const CODE_PROBLEMS: Record<Exclude<WelcomeCodeCheck, "ok">, string> = {
  invalid: "This welcome link is not valid.",
  expired: "This welcome link has expired.",
  claimed: "This welcome link has already been used.",
};

/** Throws, with `details.reason` for the page, unless the link's code can be used. */
function assertCodeOk(check: WelcomeCodeCheck): void {
  if (check !== "ok") {
    throw detailedHttpsError("failed-precondition", CODE_PROBLEMS[check], { stage: "check_code", reason: check });
  }
}

function validateWelcomeRequest(data: Partial<WelcomeRequest> | undefined): WelcomeRequest {
  const { clubId, code } = data ?? {};
  if (typeof clubId !== "string" || typeof code !== "string" || clubIdProblem(clubId)) {
    throw detailedHttpsError("failed-precondition", CODE_PROBLEMS.invalid, { stage: "validate_input", reason: "invalid" });
  }
  return { clubId, code };
}

async function loadOnboarding(db: Firestore, clubId: string) {
  const onboarding = (await db.doc(onboardingPath(clubId)).get()).data() as ClubOnboarding | undefined;
  const registration = onboarding
    ? (await db.doc(`${CLUB_REGISTRATIONS}/${onboarding.registrationId}`).get()).data() as ClubRegistration | undefined
    : undefined;
  return { onboarding, registration };
}

/** The contact as recorded at registration; the onboarding email if the registration has gone. */
function contactOf(onboarding: ClubOnboarding, registration: ClubRegistration | undefined) {
  return {
    contactName: registration?.contactName.trim() ?? "",
    contactEmail: registration?.contactEmail.trim() ?? onboarding.adminEmail,
  };
}

async function accountExists(email: string): Promise<boolean> {
  try {
    await getAuth().getUserByEmail(email);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "auth/user-not-found") return false;
    throw err;
  }
}

function splitName(name: string): { firstname: string; surname: string } {
  const [firstname = "", ...rest] = name.split(/\s+/).filter(Boolean);
  return { firstname, surname: rest.join(" ") };
}

/** Club user doc for an account created from the welcome page. */
function contactUser(clubId: string, uid: string, contactName: string, contactEmail: string): UserData {
  return {
    id: uid,
    role: "club-admin",
    tenantId: clubId,
    email: contactEmail,
    ...splitName(contactName),
    updatedBy: uid,
    updatedAt: new Date().toISOString(),
    boats: [],
  };
}

/** Welcome page: what to show for a welcome link. Needs no sign-in; the code is the proof. */
export const getClubWelcome = onCall<WelcomeRequest>(async request => {
  const { clubId, code } = validateWelcomeRequest(request.data);
  const db = getFirestore();
  const { onboarding, registration } = await loadOnboarding(db, clubId);
  assertCodeOk(checkWelcomeCode(onboarding, code, new Date()));

  const club = (await db.doc(`clubs/${clubId}`).get()).data();
  const contact = contactOf(onboarding!, registration);
  return {
    clubName: (club?.name as string | undefined) ?? registration?.clubName ?? clubId,
    ...contact,
    accountExists: await accountExists(contact.contactEmail),
  };
});

interface CompleteWelcomeRequest extends WelcomeRequest {
  /** When not signed in: the password for a new account with the contact email. */
  password?: string;
}

/**
 * Welcome page: makes the person with the link the club's first administrator. Signed in
 * (Google or an existing account), the caller is made admin. Not signed in, an account is
 * created for the contact email with the given password, already verified because the
 * link was emailed to that address.
 */
export const completeClubWelcome = onCall<CompleteWelcomeRequest>(async request => {
  const { clubId, code } = validateWelcomeRequest(request.data);
  const db = getFirestore();
  const { onboarding, registration } = await loadOnboarding(db, clubId);

  // Signing in with the contact's verified email may already have claimed the club
  // (ensureUserData), just before the page calls this.
  const callerUid = request.auth?.uid;
  if (callerUid && onboarding?.claimedBy === callerUid) {
    await setClubAdminClaim(callerUid, clubId);
    return { created: false, email: request.auth?.token.email ?? "" };
  }

  assertCodeOk(checkWelcomeCode(onboarding, code, new Date()));
  const { contactName, contactEmail } = contactOf(onboarding!, registration);

  /** Returns false when the caller had already claimed the club. */
  const claim = (uid: string, newUser: UserData) => db.runTransaction(async tx => {
    const current = (await tx.get(db.doc(onboardingPath(clubId)))).data() as ClubOnboarding | undefined;
    if (current?.claimedBy === uid) return false;
    assertCodeOk(checkWelcomeCode(current, code, new Date()));
    await claimClubInTransaction(tx, db, clubId, uid, current!, newUser);
    return true;
  });

  if (request.auth) {
    const auth = request.auth;
    await claim(auth.uid, makeUser(clubId, auth.uid, "club-admin", auth));
    await setClubAdminClaim(auth.uid, clubId);
    const email = auth.token.email;
    if (email && normaliseEmail(email) === onboarding!.adminEmail && !auth.token.email_verified) {
      await getAuth().updateUser(auth.uid, { emailVerified: true });
    }
    logger.info("completeClubWelcome: signed-in user is club admin", { clubId, uid: auth.uid });
    return { created: false, email: email ?? "" };
  }

  const password = request.data.password;
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw detailedHttpsError("invalid-argument", `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`, {
      stage: "validate_password",
    });
  }
  if (await accountExists(contactEmail)) {
    throw detailedHttpsError("failed-precondition", `There is already a ScoreSmarter account for ${contactEmail}. Sign in first.`, {
      stage: "create_account",
      reason: "account-exists",
    });
  }

  const user = await getAuth().createUser({
    email: contactEmail,
    password,
    displayName: contactName || undefined,
    emailVerified: true,
  });
  try {
    await claim(user.uid, contactUser(clubId, user.uid, contactName, contactEmail));
    await setClubAdminClaim(user.uid, clubId);
  } catch (err) {
    await getAuth().deleteUser(user.uid);
    throw err;
  }
  logger.info("completeClubWelcome: account created for club admin", { clubId, uid: user.uid });
  return { created: true, email: contactEmail };
});

/** Sys-admin: replaces an unclaimed club's welcome link and emails the new one. */
export const reissueClubWelcome = onCall<{ registrationId: string }>({ secrets: [POSTMARK_SECRET] }, async request => {
  assertAuthenticated(request.auth);
  if (!isSysAdmin(request.auth.token)) {
    throw detailedHttpsError("permission-denied", "Only a system administrator can resend welcome links.", {
      stage: "assert_permissions",
    });
  }
  const { registrationId } = request.data ?? {};
  if (!registrationId || typeof registrationId !== "string") {
    throw detailedHttpsError("invalid-argument", "registrationId is required.", { stage: "validate_input" });
  }
  const db = getFirestore();
  const registrationRef = db.doc(`${CLUB_REGISTRATIONS}/${registrationId}`);

  const { registration, code } = await db.runTransaction(async tx => {
    const registration = (await tx.get(registrationRef)).data() as ClubRegistration | undefined;
    if (registration?.status !== "approved" || !registration.clubId) {
      throw detailedHttpsError("failed-precondition", "This registration has not been approved.", { stage: "check_status" });
    }
    const onboardingRef = db.doc(onboardingPath(registration.clubId));
    const onboarding = (await tx.get(onboardingRef)).data() as ClubOnboarding | undefined;
    if (!onboarding || onboarding.claimedBy) {
      throw detailedHttpsError("failed-precondition", "The club's administrator has already joined.", {
        stage: "check_claimed",
      });
    }
    const issued = issueWelcomeCode(new Date());
    tx.update(onboardingRef, issued.fields);
    return { registration, code: issued.code };
  });

  const clubId = registration.clubId!;
  const club = (await db.doc(`clubs/${clubId}`).get()).data();
  const link = welcomeUrl(clubId, code);
  const emailSent = await sendEmail(
    clubApprovedEmail(registration, clubId, (club?.name as string | undefined) ?? registration.clubName, link),
  );
  if (emailSent) await registrationRef.update({ "emailsSent.approved": true });
  logger.info("reissueClubWelcome: new welcome link", { registrationId, clubId, emailSent });
  return { welcomeUrl: link, emailSent };
});
