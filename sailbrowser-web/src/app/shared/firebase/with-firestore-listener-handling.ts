import { inject } from '@angular/core';
import { MonoTypeOperatorFunction, tap } from 'rxjs';
import { FirestoreListenerErrorReporter } from './firestore-listener-error-reporter';
import { classifyFirestoreError } from './firestore-listener-errors';

export interface FirestoreListenerHandlingOptions {
  /** Logical listener name for logs / reporter (e.g. `boats`, `race-calendar-races`). */
  name: string;
  /**
   * Optional reporter. When omitted, {@link FirestoreListenerErrorReporter} is
   * injected — call this operator from an injection context (e.g. field
   * initializer or {@link firestoreListenerResource}).
   */
  reporter?: FirestoreListenerErrorReporter;
}

/**
 * Log terminal Firestore listener failures. Does not retry — the SDK handles
 * soft offline/reconnect; a stream error means the listener is already dead.
 * The error still propagates so {@link rxResource} surfaces {@code error}.
 */
export function withFirestoreListenerHandling<T>(
  nameOrOptions: string | FirestoreListenerHandlingOptions,
): MonoTypeOperatorFunction<T> {
  const options: FirestoreListenerHandlingOptions =
    typeof nameOrOptions === 'string' ? { name: nameOrOptions } : nameOrOptions;
  const reporter = options.reporter ?? inject(FirestoreListenerErrorReporter);
  const { name } = options;

  return source =>
    source.pipe(
      tap({
        error: (error: unknown) => {
          const classified = classifyFirestoreError(error);
          reporter.report({
            name,
            code: classified.code,
            message: classified.message,
            raw: classified.raw,
          });
        },
      }),
    );
}
