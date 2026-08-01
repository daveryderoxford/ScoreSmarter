/**
 * Classify Firebase App Check / related Auth failures for support-facing codes.
 */

export type AppCheckSupportCode =
  | 'APPCHECK_THROTTLED'
  | 'APPCHECK_403'
  | 'APPCHECK_TOKEN_INVALID'
  | 'APPCHECK_FETCH_FAILED'
  | 'APPCHECK_DOWNSTREAM_PERMISSION'
  | 'APPCHECK_UNKNOWN';

export interface ClassifiedAppCheckError {
  supportCode: AppCheckSupportCode;
  /** Firebase / SDK code when present (e.g. appCheck/throttled). */
  code: string;
  message: string;
  raw: unknown;
}

export interface AppCheckFailureEvent extends ClassifiedAppCheckError {
  at: number;
  /** Optional listener / source label (e.g. firestore boats). */
  source?: string;
}

export function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown';
  if (!('code' in error) || error.code == null) return 'unknown';
  return String(error.code);
}

export function errorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && error.message != null) {
    return String(error.message);
  }
  return String(error);
}

/** True when an error is clearly App Check / App Check–gated Auth. */
export function isAppCheckRelatedError(error: unknown): boolean {
  const code = errorCode(error).toLowerCase();
  const message = errorMessage(error).toLowerCase();
  return (
    code.startsWith('appcheck/') ||
    code.includes('app-check') ||
    message.includes('appcheck') ||
    message.includes('app check') ||
    message.includes('firebase-app-check') ||
    message.includes('app-check-token')
  );
}

export function classifyAppCheckError(error: unknown): ClassifiedAppCheckError {
  const code = errorCode(error);
  const message = errorMessage(error);
  const lowerCode = code.toLowerCase();
  const lowerMessage = message.toLowerCase();

  let supportCode: AppCheckSupportCode = 'APPCHECK_UNKNOWN';

  if (
    lowerCode.includes('throttl') ||
    lowerMessage.includes('throttl') ||
    lowerMessage.includes('attempts allowed again')
  ) {
    supportCode = 'APPCHECK_THROTTLED';
  } else if (
    lowerCode.includes('firebase-app-check-token-is-invalid') ||
    lowerMessage.includes('firebase-app-check-token-is-invalid') ||
    lowerMessage.includes('app-check-token-is-invalid')
  ) {
    supportCode = 'APPCHECK_TOKEN_INVALID';
  } else if (
    lowerMessage.includes('403') ||
    lowerMessage.includes('attestation failed') ||
    lowerCode.includes('fetch-status-error')
  ) {
    supportCode = 'APPCHECK_403';
  } else if (lowerCode.startsWith('appcheck/') || isAppCheckRelatedError(error)) {
    supportCode = 'APPCHECK_FETCH_FAILED';
  }

  return { supportCode, code, message, raw: error };
}

export function formatAppCheckFailure(event: AppCheckFailureEvent): string {
  const source = event.source ? ` source=${event.source}` : '';
  return `[AppCheck] ${event.supportCode} (${event.code})${source}: ${event.message}`;
}

/** Clipboard / support payload — short and quotable. */
export function formatAppCheckSupportDetails(event: AppCheckFailureEvent): string {
  const when = new Date(event.at).toISOString();
  const lines = [
    `ScoreSmarter support code: ${event.supportCode}`,
    `Time (UTC): ${when}`,
    `SDK code: ${event.code}`,
    `Message: ${event.message}`,
  ];
  if (event.source) {
    lines.push(`Source: ${event.source}`);
  }
  return lines.join('\n');
}
