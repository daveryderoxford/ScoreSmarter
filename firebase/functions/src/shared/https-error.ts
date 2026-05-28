import { HttpsError } from 'firebase-functions/https';

export function detailedHttpsError(
   code: "invalid-argument" | "permission-denied" | "unauthenticated" | "not-found" | "failed-precondition" | "internal",
   message: string,
   details: unknown,
): HttpsError {
   return new HttpsError(code, message, details);
}
