import {
  classifyFirestoreError,
  firestoreErrorCode,
  formatFirestoreListenerError,
} from './firestore-listener-errors';

describe('firestore-listener-errors', () => {
  it('normalizes firestore/ prefixed codes', () => {
    expect(firestoreErrorCode({ code: 'firestore/unavailable' })).toBe('unavailable');
    expect(firestoreErrorCode({ code: 'unavailable' })).toBe('unavailable');
  });

  it('classifies code and message for logging', () => {
    const classified = classifyFirestoreError({ code: 'permission-denied', message: 'missing or insufficient permissions.' });
    expect(classified.code).toBe('permission-denied');
    expect(classified.message).toContain('permissions');
  });

  it('formats events for console reporting', () => {
    const text = formatFirestoreListenerError({
      name: 'boats',
      code: 'unavailable',
      message: 'backend down',
      at: 0,
      raw: null,
    });
    expect(text).toBe('[FirestoreListener:boats] unavailable: backend down');
  });
});
