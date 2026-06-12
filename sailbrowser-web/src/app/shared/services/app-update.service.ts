import { DestroyRef, Injectable, inject, isDevMode, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { environment } from '../../../environments/environment';
import { concat, filter, from, fromEvent, interval } from 'rxjs';

const LOG_PREFIX = '[ScoreSmarter]';

/** How often to poll for a new deployment once the service worker is active. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _updateMessage = signal<string | null>(null);

  /** Non-null when the UI should show an update snackbar. Read from App via effect. */
  readonly updateMessage = this._updateMessage.asReadonly();

  initialize(): void {
    void this.logRuntimeState();

    if (isDevMode() || !this.swUpdate.isEnabled) {
      console.info(`${LOG_PREFIX} Update checks inactive (dev mode or service worker disabled).`);
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(evt => this.logVersionEvent(evt));

    this.swUpdate.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(err => {
      console.error(`${LOG_PREFIX} Service worker unrecoverable:`, err);
      this.requestReload('Something went wrong. Reload to continue.');
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.info(`${LOG_PREFIX} Service worker now controlling this tab — update checks active.`, {
          appVersion: environment.appVersion,
          swScriptUrl: navigator.serviceWorker.controller?.scriptURL ?? null,
        });
        void this.checkForUpdate();
      });

      concat(
        from(navigator.serviceWorker.ready.then(() => undefined)),
        interval(UPDATE_CHECK_INTERVAL_MS),
      )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => void this.checkForUpdate());
    }

    fromEvent(document, 'visibilitychange')
      .pipe(
        filter(() => document.visibilityState === 'visible'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.checkForUpdate());
  }

  requestReload(message = 'A new version is available.'): void {
    this._updateMessage.set(message);
  }

  dismissPrompt(): void {
    this._updateMessage.set(null);
  }

  async activateAndReload(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      location.reload();
    }
  }

  private async logRuntimeState(): Promise<void> {
    const controller = navigator.serviceWorker?.controller;
    const swControllingPage = !!controller;
    console.info(`${LOG_PREFIX} Runtime`, {
      appVersion: environment.appVersion,
      production: environment.production,
      devMode: isDevMode(),
      swUpdateEnabled: this.swUpdate.isEnabled,
      swControllingPage,
      swScriptUrl: controller?.scriptURL ?? null,
    });

    if (this.swUpdate.isEnabled && !swControllingPage) {
      console.info(
        `${LOG_PREFIX} Service worker is installed but not controlling this tab yet — reload once. ` +
          'Update checks and the reload snackbar only work after the SW controls the page.',
      );
    }

    if (!('serviceWorker' in navigator)) {
      console.info(`${LOG_PREFIX} Service workers not supported in this browser.`);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      console.info(`${LOG_PREFIX} Service worker ready`, {
        scope: registration.scope,
        activeScript: registration.active?.scriptURL ?? null,
        waitingScript: registration.waiting?.scriptURL ?? null,
        installingScript: registration.installing?.scriptURL ?? null,
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} Service worker not ready:`, err);
    }
  }

  private logVersionEvent(evt: VersionEvent): void {
    const base = { type: evt.type, appVersion: environment.appVersion };

    switch (evt.type) {
      case 'VERSION_READY':
        console.info(`${LOG_PREFIX} Update event`, {
          ...base,
          currentHash: evt.currentVersion.hash,
          latestHash: evt.latestVersion.hash,
        });
        this.requestReload();
        break;
      case 'VERSION_DETECTED':
      case 'NO_NEW_VERSION_DETECTED':
        console.info(`${LOG_PREFIX} Update event`, {
          ...base,
          hash: evt.version.hash,
        });
        break;
      case 'VERSION_INSTALLATION_FAILED':
        console.error(`${LOG_PREFIX} Update installation failed`, {
          ...base,
          hash: evt.version.hash,
          error: evt.error,
        });
        console.error(
          `${LOG_PREFIX} A deployed file did not match ngsw.json (CDN cache, partial deploy, or ` +
            'post-build file changes). Expand the error above for the file URL. ' +
            'Fix hosting cache headers for index.html, ngsw.json, and ngsw-worker.js.',
        );
        break;
    }
  }

  private async checkForUpdate(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    try {
      await navigator.serviceWorker.ready;
      const found = await this.swUpdate.checkForUpdate();
      console.info(`${LOG_PREFIX} checkForUpdate`, {
        appVersion: environment.appVersion,
        updateFound: found,
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} checkForUpdate failed:`, err);
    }
  }
}
