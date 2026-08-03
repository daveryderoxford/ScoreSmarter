/** Default budget for a single Firestore read/write before treating the connection as stuck. */
export const FIRESTORE_WRITE_TIMEOUT_MS = 30_000;

/** Longer budget for multi-doc saves (scan review, publish, bulk order persist). */
export const FIRESTORE_BULK_WRITE_TIMEOUT_MS = 120_000;

/** Reject if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Check your connection and try again.`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Convenience wrapper for typical single-doc Firestore operations. */
export function firestoreWrite<T>(promise: Promise<T>, label: string): Promise<T> {
  return withTimeout(promise, FIRESTORE_WRITE_TIMEOUT_MS, label);
}
