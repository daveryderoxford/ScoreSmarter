import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import type { ClubOnboarding } from "./onboarding-model.js";

/** How long a welcome link stays valid. */
export const WELCOME_CODE_DAYS = 30;

export const hashWelcomeCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** A one-time code for the welcome link; only its hash is stored. */
export function newWelcomeCode(): { code: string; codeHash: string } {
  const code = randomBytes(32).toString("base64url");
  return { code, codeHash: hashWelcomeCode(code) };
}

/** A new code and the onboarding doc fields that store it, replacing any earlier code. */
export function issueWelcomeCode(now: Date): {
  code: string;
  fields: Pick<Required<ClubOnboarding>, "codeHash" | "codeExpiresAt">;
} {
  const { code, codeHash } = newWelcomeCode();
  const codeExpiresAt = Timestamp.fromMillis(now.getTime() + WELCOME_CODE_DAYS * 24 * 60 * 60 * 1000);
  return { code, fields: { codeHash, codeExpiresAt } };
}

export type WelcomeCodeCheck = "ok" | "invalid" | "expired" | "claimed";

export function checkWelcomeCode(
  onboarding: Pick<ClubOnboarding, "codeHash" | "codeExpiresAt" | "claimedBy"> | undefined,
  code: string,
  now: Date,
): WelcomeCodeCheck {
  if (!onboarding) return "invalid";
  if (onboarding.claimedBy) return "claimed";
  if (!onboarding.codeHash || !code) return "invalid";
  const expected = Buffer.from(onboarding.codeHash, "hex");
  const actual = Buffer.from(hashWelcomeCode(code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return "invalid";
  if (!onboarding.codeExpiresAt || onboarding.codeExpiresAt.toMillis() <= now.getTime()) return "expired";
  return "ok";
}
