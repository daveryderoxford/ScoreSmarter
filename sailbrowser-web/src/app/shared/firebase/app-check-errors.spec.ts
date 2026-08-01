import {
  classifyAppCheckError,
  formatAppCheckSupportDetails,
  isAppCheckRelatedError,
} from './app-check-errors';

describe('app-check-errors', () => {
  it('classifies throttle messages', () => {
    const classified = classifyAppCheckError({
      code: 'appCheck/throttled',
      message: 'Requests throttled due to previous 403 error. Attempts allowed again after 23h',
    });
    expect(classified.supportCode).toBe('APPCHECK_THROTTLED');
  });

  it('classifies 403 attestation failures', () => {
    const classified = classifyAppCheckError({
      code: 'appCheck/fetch-status-error',
      message: 'Fetch server returned an HTTP error status. HTTP status: 403',
    });
    expect(classified.supportCode).toBe('APPCHECK_403');
  });

  it('classifies Auth App Check token invalid', () => {
    const classified = classifyAppCheckError({
      code: 'auth/firebase-app-check-token-is-invalid',
      message: 'Firebase: Error (auth/firebase-app-check-token-is-invalid).',
    });
    expect(classified.supportCode).toBe('APPCHECK_TOKEN_INVALID');
    expect(isAppCheckRelatedError(classified.raw)).toBe(true);
  });

  it('formats support details for clipboard', () => {
    const text = formatAppCheckSupportDetails({
      supportCode: 'APPCHECK_THROTTLED',
      code: 'appCheck/throttled',
      message: 'throttled',
      raw: null,
      at: Date.parse('2026-08-01T10:00:00.000Z'),
      source: 'visibility',
    });
    expect(text).toContain('APPCHECK_THROTTLED');
    expect(text).toContain('2026-08-01T10:00:00.000Z');
    expect(text).toContain('visibility');
  });
});
