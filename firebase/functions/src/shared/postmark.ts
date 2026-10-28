import { logger } from "firebase-functions/v2";

/** Secret Manager name of the Postmark Server API token; list it in the function's `secrets`. */
export const POSTMARK_SECRET = "POSTMARK_SERVER_TOKEN";

const FROM = "ScoreSmarter <noreply@scoresmarter.app>";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  /** Postmark tag, for grouping messages in its activity view. */
  tag: string;
}

/**
 * Sends a transactional email through Postmark. Returns false, after logging, when the
 * email could not be sent: callers must treat email as best effort.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const token = process.env[POSTMARK_SECRET];
  if (!token) {
    logger.error(`sendEmail: ${POSTMARK_SECRET} is not set`, { tag: message.tag });
    return false;
  }
  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: FROM,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        ReplyTo: message.replyTo,
        Tag: message.tag,
        MessageStream: "outbound",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.error("sendEmail: Postmark rejected the email", {
        tag: message.tag,
        status: response.status,
        body: await response.text(),
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("sendEmail: Postmark request failed", { tag: message.tag, error: String(err) });
    return false;
  }
}
