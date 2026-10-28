import type { Timestamp } from "firebase-admin/firestore";

/** Top-level collection the home site's registration form writes to. */
export const CLUB_REGISTRATIONS = "club-registrations";

export type RegistrationStatus = "new" | "approved" | "rejected";

/** Emails sent for a registration, recorded so retried triggers don't send twice. */
export interface RegistrationEmails {
  received?: boolean;
  notified?: boolean;
  approved?: boolean;
}

export interface ClubRegistration {
  id: string;
  clubName: string;
  subdomain: string;
  contactName: string;
  contactEmail: string;
  status: RegistrationStatus;
  source: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  notes?: string;
  clubId?: string;
  approvedBy?: string;
  approvedAt?: Timestamp;
  adminClaimedBy?: string;
  adminClaimedAt?: Timestamp;
  emailsSent?: RegistrationEmails;
}

/** Server-only: who becomes the club's first club admin. No Firestore rule covers it. */
export const onboardingPath = (clubId: string) => `clubs/${clubId}/private/onboarding`;

export interface ClubOnboarding {
  /** Trimmed, lower-cased contact email from the registration. */
  adminEmail: string;
  registrationId: string;
  createdAt: Timestamp;
  /** SHA-256 of the welcome link's one-time code; removed once claimed. */
  codeHash?: string;
  codeExpiresAt?: Timestamp;
  claimedBy?: string;
  claimedAt?: Timestamp;
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const clubUrl = (clubId: string) => `https://${clubId}.ro.scoresmarter.app`;

/** The club site page where the contact sets up their administrator account. */
export const welcomeUrl = (clubId: string, code: string) =>
  `${clubUrl(clubId)}/auth/welcome?code=${encodeURIComponent(code)}`;

/**
 * Where a new club is in setting itself up. Clubs created before onboarding have no
 * status and are treated as established. Stored on the public club doc, so no
 * personal data goes with it.
 */
export type OnboardingStatus = "awaiting-admin" | "setting-up" | "complete";

/**
 * A new club document. Only fields the web app cannot default are set: `ClubStore`
 * requires the three arrays, and supplies scoring defaults, laps and OOD scoring itself.
 */
export function newClubDoc(
  registration: Pick<ClubRegistration, "contactName" | "contactEmail">,
  clubName: string,
  startedAt: Timestamp,
) {
  return {
    name: clubName.trim(),
    contactName: registration.contactName.trim(),
    contactEmail: registration.contactEmail.trim(),
    fleets: [],
    classes: [],
    seasons: [],
    supportedHandicapSchemes: ["PY"],
    onboardingStatus: "awaiting-admin" as OnboardingStatus,
    onboardingStartedAt: startedAt,
  };
}

/** Club doc fields set when the club's first administrator joins. */
export const adminJoinedFields = (joinedAt: Timestamp) => ({
  onboardingStatus: "setting-up" as OnboardingStatus,
  adminJoinedAt: joinedAt,
});

/**
 * The first signed-in user whose verified email matches the registered contact email
 * becomes club admin; nobody after that.
 */
export function shouldGrantFirstAdmin(
  onboarding: Pick<ClubOnboarding, "adminEmail" | "claimedBy"> | undefined,
  token: { email?: string; email_verified?: boolean },
): boolean {
  if (!onboarding || onboarding.claimedBy) return false;
  if (token.email_verified !== true || !token.email) return false;
  return normaliseEmail(token.email) === onboarding.adminEmail;
}
