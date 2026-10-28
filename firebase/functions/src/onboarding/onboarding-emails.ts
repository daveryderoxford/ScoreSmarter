import { SUPPORT_SENDER, type EmailMessage } from "../shared/postmark.js";
import { clubUrl, type ClubRegistration } from "./onboarding-model.js";

type Registration = Pick<ClubRegistration, "clubName" | "subdomain" | "contactName" | "contactEmail">;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name.trim();

/** To the club's contact when their registration arrives. */
export function registrationReceivedEmail(registration: Registration): EmailMessage {
  return {
    from: SUPPORT_SENDER,
    to: registration.contactEmail,
    tag: "registration-received",
    subject: `We've received your ScoreSmarter request for ${registration.clubName}`,
    text: [
      `Hello ${firstName(registration.contactName)},`,
      "",
      `Thank you for registering ${registration.clubName} with ScoreSmarter.`,
      "We'll review your request and email you at this address when your club is ready.",
      "",
      "The ScoreSmarter team",
    ].join("\n"),
  };
}

/** To ScoreSmarter's system administrators when a registration arrives. */
export function registrationNotificationEmail(registration: Registration, to: string): EmailMessage {
  return {
    to,
    tag: "registration-notification",
    replyTo: registration.contactEmail,
    subject: `New club registration: ${registration.clubName}`,
    text: [
      `Club: ${registration.clubName}`,
      `Requested address: ${clubUrl(registration.subdomain)}`,
      `Contact: ${registration.contactName} <${registration.contactEmail}>`,
      "",
      "Review it under System Administration > Club registrations.",
    ].join("\n"),
  };
}

/** To the club's contact when their club has been set up. */
export function clubApprovedEmail(registration: Registration, clubId: string, clubName: string): EmailMessage {
  const url = clubUrl(clubId);
  return {
    from: SUPPORT_SENDER,
    to: registration.contactEmail,
    tag: "registration-approved",
    subject: `${clubName} is ready on ScoreSmarter`,
    text: [
      `Hello ${firstName(registration.contactName)},`,
      "",
      `${clubName} is now set up on ScoreSmarter at:`,
      url,
      "",
      `Sign in there using this email address (${registration.contactEmail}) and you will`,
      "become the club's administrator automatically. You can sign in with Google, or",
      "create an account with this email address and confirm it from the email we send you.",
      "",
      "Once signed in, open Club settings to upload your burgee or logo, then add your",
      "classes, fleets and first season.",
      "",
      "The ScoreSmarter team",
    ].join("\n"),
  };
}
