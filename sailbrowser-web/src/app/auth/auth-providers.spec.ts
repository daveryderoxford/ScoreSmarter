import { describe, expect, it } from 'vitest';
import {
  AUTH_PROVIDERS,
  enabledOAuthProviders,
  isOAuthProviderEnabled,
  oauthAuthProvider,
} from './auth-providers';

describe('auth-providers', () => {
  it('enables Google and disables Facebook', () => {
    expect(AUTH_PROVIDERS.google).toBe(true);
    expect(AUTH_PROVIDERS.facebook).toBe(false);
    expect(isOAuthProviderEnabled('Google')).toBe(true);
    expect(isOAuthProviderEnabled('Facebook')).toBe(false);
  });

  it('lists only enabled OAuth providers for the login UI', () => {
    expect(enabledOAuthProviders).toEqual(['Google']);
  });

  it('returns a Firebase provider only when enabled', () => {
    expect(oauthAuthProvider('Google')).toBeDefined();
    expect(oauthAuthProvider('Facebook')).toBeUndefined();
  });
});
