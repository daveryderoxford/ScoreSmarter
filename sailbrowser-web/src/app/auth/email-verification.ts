import type { ActionCodeSettings, User } from '@angular/fire/auth';

/**
 * Email/password accounts must verify before using the app.
 * OAuth providers (e.g. Google) are treated as already verified by Firebase.
 */
export function needsEmailVerification(user: User | null | undefined): boolean {
  if (!user || user.emailVerified) return false;
  return user.providerData.some(p => p.providerId === 'password');
}

/** Continue URL after Firebase's default verify-email handler (same origin as the app). */
export function emailVerificationActionCodeSettings(): ActionCodeSettings {
  return {
    url: `${window.location.origin}/auth/verify-email`,
    handleCodeInApp: false,
  };
}
