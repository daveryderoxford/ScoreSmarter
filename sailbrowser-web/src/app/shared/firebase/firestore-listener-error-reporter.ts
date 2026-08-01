import { Injectable, computed, inject, signal } from '@angular/core';
import { AppCheckFailureReporter } from './app-check-failure-reporter';
import {
  formatFirestoreListenerError,
  type FirestoreListenerErrorEvent,
} from './firestore-listener-errors';

const MAX_EVENTS = 50;

/**
 * Ring buffer of terminal Firestore listener errors for debugging.
 * Soft offline never reaches here — only stream-ending failures.
 */
@Injectable({ providedIn: 'root' })
export class FirestoreListenerErrorReporter {
  private readonly appCheckFailures = inject(AppCheckFailureReporter);

  private readonly _events = signal<readonly FirestoreListenerErrorEvent[]>([]);
  /** When set, the app shell should prompt the user to reload. */
  private readonly _reloadPrompt = signal(false);

  readonly events = this._events.asReadonly();
  readonly lastError = computed(() => {
    const list = this._events();
    return list.length === 0 ? undefined : list[list.length - 1];
  });
  readonly reloadPrompt = this._reloadPrompt.asReadonly();

  report(event: Omit<FirestoreListenerErrorEvent, 'at'> & { at?: number }): void {
    const full: FirestoreListenerErrorEvent = {
      ...event,
      at: event.at ?? Date.now(),
    };
    this._events.update(list => [...list.slice(-(MAX_EVENTS - 1)), full]);

    // Prefer App Check as the support-facing root cause when attestation is unhealthy.
    if (full.code === 'permission-denied' && this.appCheckFailures.failedRecently()) {
      this.appCheckFailures.reportDownstreamPermission(full.name, {
        code: String(full.code),
        message: full.message,
      });
      console.error(formatFirestoreListenerError(full), full.raw);
      return;
    }

    this._reloadPrompt.set(true);
    console.error(formatFirestoreListenerError(full), full.raw);
  }

  dismissPrompt(): void {
    this._reloadPrompt.set(false);
  }

  clear(): void {
    this._events.set([]);
    this._reloadPrompt.set(false);
  }
}
