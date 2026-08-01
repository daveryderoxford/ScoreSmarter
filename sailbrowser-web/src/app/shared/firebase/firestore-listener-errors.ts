/**
 * Classify Firestore listener errors for logging / localisation.
 * Canonical codes follow google.rpc.Code / FirestoreErrorCode:
 * https://docs.cloud.google.com/datastore/docs/concepts/errors
 *
 * Soft offline is handled inside the Firestore SDK (cache + reconnect).
 * This helper only runs when a listener stream has already terminated.
 */

export type FirestoreListenerErrorCode =
  | 'aborted'
  | 'already-exists'
  | 'cancelled'
  | 'data-loss'
  | 'deadline-exceeded'
  | 'failed-precondition'
  | 'internal'
  | 'invalid-argument'
  | 'not-found'
  | 'out-of-range'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'unauthenticated'
  | 'unavailable'
  | 'unimplemented'
  | 'unknown';

export interface ClassifiedFirestoreError {
  code: FirestoreListenerErrorCode | string;
  message: string;
  raw: unknown;
}

export interface FirestoreListenerErrorEvent extends ClassifiedFirestoreError {
  name: string;
  at: number;
}

export function firestoreErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown';
  if (!('code' in error) || error.code == null) return 'unknown';
  const raw = String(error.code);
  const slash = raw.lastIndexOf('/');
  return (slash >= 0 ? raw.slice(slash + 1) : raw).toLowerCase();
}

export function firestoreErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && error.message != null) {
    return String(error.message);
  }
  return String(error);
}

export function classifyFirestoreError(error: unknown): ClassifiedFirestoreError {
  return {
    code: firestoreErrorCode(error),
    message: firestoreErrorMessage(error),
    raw: error,
  };
}

export function formatFirestoreListenerError(event: FirestoreListenerErrorEvent): string {
  return `[FirestoreListener:${event.name}] ${event.code}: ${event.message}`;
}
