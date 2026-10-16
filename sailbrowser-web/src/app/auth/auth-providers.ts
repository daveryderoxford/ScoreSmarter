import { FacebookAuthProvider, GoogleAuthProvider, type AuthProvider } from '@angular/fire/auth';

/** OAuth providers that can appear on the login screen. Email/password is always available. */
export type OAuthProviderId = 'Google' | 'Facebook';

/**
 * Which sign-in methods to offer in the UI.
 * Keep provider implementations in this module so enabling one later is a flag flip
 * (plus turning the provider on in the Firebase console).
 */
export const AUTH_PROVIDERS = {
  google: true,
  facebook: false,
} as const;

const googleAuthProvider = new GoogleAuthProvider();
const facebookAuthProvider = new FacebookAuthProvider();

const oauthProviders: Record<OAuthProviderId, AuthProvider> = {
  Google: googleAuthProvider,
  Facebook: facebookAuthProvider,
};

export function isOAuthProviderEnabled(id: OAuthProviderId): boolean {
  switch (id) {
    case 'Google':
      return AUTH_PROVIDERS.google;
    case 'Facebook':
      return AUTH_PROVIDERS.facebook;
  }
}

/** Firebase Auth provider for an enabled OAuth method, or undefined if that method is off. */
export function oauthAuthProvider(id: OAuthProviderId): AuthProvider | undefined {
  if (!isOAuthProviderEnabled(id)) return undefined;
  return oauthProviders[id];
}

export const enabledOAuthProviders: readonly OAuthProviderId[] = (
  ['Google', 'Facebook'] as const
).filter(isOAuthProviderEnabled);
