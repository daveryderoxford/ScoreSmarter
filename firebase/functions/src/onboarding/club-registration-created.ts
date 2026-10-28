import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { POSTMARK_SECRET, sendEmail } from "../shared/postmark.js";
import { registrationNotificationEmail, registrationReceivedEmail } from "./onboarding-emails.js";
import { CLUB_REGISTRATIONS, type ClubRegistration, type RegistrationEmails } from "./onboarding-model.js";

/** Secret Manager, not .env: the repository is public. */
const NOTIFY_EMAIL_SECRET = "ONBOARDING_ALERT_EMAIL";

/**
 * Acknowledges a new club registration to its contact and alerts the system
 * administrators at the ONBOARDING_ALERT_EMAIL address.
 */
export const clubRegistrationCreated = onDocumentCreated(
  { document: `${CLUB_REGISTRATIONS}/{registrationId}`, secrets: [POSTMARK_SECRET, NOTIFY_EMAIL_SECRET] },
  async event => {
    const ref = getFirestore().doc(`${CLUB_REGISTRATIONS}/${event.params.registrationId}`);
    // Re-read rather than use the event snapshot, so a redelivered event sees emails already sent.
    const snap = await ref.get();
    if (!snap.exists) return;
    const registration = snap.data() as ClubRegistration;
    const sent: Required<RegistrationEmails> = {
      received: registration.emailsSent?.received ?? false,
      notified: registration.emailsSent?.notified ?? false,
      approved: registration.emailsSent?.approved ?? false,
    };

    if (!sent.received) {
      sent.received = await sendEmail(registrationReceivedEmail(registration));
    }
    const notifyTo = process.env[NOTIFY_EMAIL_SECRET];
    if (!sent.notified) {
      if (notifyTo) {
        sent.notified = await sendEmail(registrationNotificationEmail(registration, notifyTo));
      } else {
        logger.warn(`clubRegistrationCreated: ${NOTIFY_EMAIL_SECRET} is not set; no alert sent`);
      }
    }

    await ref.update({ "emailsSent.received": sent.received, "emailsSent.notified": sent.notified });
    logger.info("clubRegistrationCreated: emails", { registrationId: registration.id, ...sent });
  },
);
