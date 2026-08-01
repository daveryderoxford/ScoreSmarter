import { Injectable, computed, signal } from '@angular/core';
import { getToken, onTokenChanged, type AppCheck } from '@angular/fire/app-check';
import {
  classifyAppCheckError,
  formatAppCheckFailure,
  formatAppCheckSupportDetails,
  isAppCheckRelatedError,
  type AppCheckFailureEvent,
  type AppCheckSupportCode,
} from './app-check-errors';

/** Correlate Firestore permission-denied with a recent App Check failure. */
const RECENT_FAILURE_MS = 5 * 60 * 1000;

/**
 * Tracks App Check attestation failures for support-facing UI.
 * Soft {@link getToken} probes detect throttle/403; {@link onTokenChanged}
 * alone does not surface attestation failures from the SDK.
 */
@Injectable({ providedIn: 'root' })
export class AppCheckFailureReporter {
  private readonly _failure = signal<AppCheckFailureEvent | undefined>(undefined);
  private readonly _prompt = signal(false);
  private watching = false;

  readonly failure = this._failure.asReadonly();
  readonly prompt = this._prompt.asReadonly();
  readonly supportCode = computed(() => this._failure()?.supportCode);

  /** Attach listeners once after {@link initializeAppCheck}. */
  watch(appCheck: AppCheck): void {
    if (this.watching) return;
    this.watching = true;

    onTokenChanged(appCheck, () => {
      /* success path handled via probe(); attestation errors use onError rarely */
    }, (error: Error) => {
      this.report(error, 'onTokenChanged');
    });

    void this.probe(appCheck, 'startup');

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void this.probe(appCheck, 'visibility');
        }
      });
    }
  }

  /**
   * Soft token read (no force refresh) — surfaces throttle / prior 403 without
   * forcing a new reCAPTCHA exchange when a cached token is still valid.
   * Success clears a prior failure banner (attestation recovered).
   */
  async probe(appCheck: AppCheck, source: string): Promise<void> {
    try {
      await getToken(appCheck, false);
      this.clear();
    } catch (error: unknown) {
      this.report(error, source);
    }
  }

  report(error: unknown, source?: string): void {
    const classified = classifyAppCheckError(error);
    const code = classified.code.toLowerCase();
    if (
      source !== 'downstream-permission' &&
      classified.supportCode === 'APPCHECK_UNKNOWN' &&
      !isAppCheckRelatedError(error) &&
      !code.startsWith('appcheck/')
    ) {
      return;
    }

    const event: AppCheckFailureEvent = {
      ...classified,
      at: Date.now(),
      source,
    };
    this._failure.set(event);
    this._prompt.set(true);
    console.error(formatAppCheckFailure(event), event.raw);
  }

  /**
   * Firestore (or similar) returned permission-denied while App Check is
   * already known to be unhealthy — attribute to App Check for support.
   */
  reportDownstreamPermission(listenerName: string, detail: { code: string; message: string }): void {
    const prior = this._failure();
    const event: AppCheckFailureEvent = {
      supportCode: 'APPCHECK_DOWNSTREAM_PERMISSION',
      code: detail.code,
      message: prior
        ? `${detail.message} (likely caused by ${prior.supportCode})`
        : detail.message,
      raw: detail,
      at: Date.now(),
      source: listenerName,
    };
    this._failure.set(event);
    this._prompt.set(true);
    console.error(formatAppCheckFailure(event));
  }

  reportFromAuthOrKiosk(error: unknown, source = 'auth'): void {
    if (!isAppCheckRelatedError(error)) return;
    this.report(error, source);
  }

  failedRecently(withinMs: number = RECENT_FAILURE_MS): boolean {
    const f = this._failure();
    if (!f) return false;
    return Date.now() - f.at <= withinMs;
  }

  supportDetails(): string | undefined {
    const f = this._failure();
    return f ? formatAppCheckSupportDetails(f) : undefined;
  }

  dismissPrompt(): void {
    this._prompt.set(false);
  }

  clear(): void {
    this._failure.set(undefined);
    this._prompt.set(false);
  }
}

export type { AppCheckSupportCode };
