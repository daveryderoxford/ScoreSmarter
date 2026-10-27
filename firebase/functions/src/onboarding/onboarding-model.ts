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
  claimedBy?: string;
  claimedAt?: Timestamp;
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const clubUrl = (clubId: string) => `https://${clubId}.ro.scoresmarter.app`;

/**
 * A new club document. Only fields the web app cannot default are set: `ClubStore`
 * requires the three arrays, and supplies scoring defaults, laps and OOD scoring itself.
 */
export function newClubDoc(registration: Pick<ClubRegistration, "contactName" | "contactEmail">, clubName: string) {
  return {
    name: clubName.trim(),
    contactName: registration.contactName.trim(),
    contactEmail: registration.contactEmail.trim(),
    fleets: [],
    classes: [],
    seasons: [],
    supportedHandicapSchemes: ["PY"],
  };
}

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
