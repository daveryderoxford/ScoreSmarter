import {
  DestroyRef,
  EnvironmentInjector,
  Injectable,
  afterNextRender,
  inject,
  isDevMode,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, filter, from, fromEvent, interval } from 'rxjs';

/** How often to poll for a new deployment once the service worker is active. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackbar = inject(MatSnackBar);
  private readonly envInjector = inject(EnvironmentInjector);
  private readonly destroyRef = inject(DestroyRef);

  private updatePromptOpen = false;

  initialize(): void {
    if (isDevMode() || !this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.promptReload());

    this.swUpdate.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.promptReload('Something went wrong. Reload to continue.');
    });

    if ('serviceWorker' in navigator) {
      // Zoneless: avoid ApplicationRef.isStable — it becomes true immediately and
      // RxJS interval before stability blocks SW registration. Wait for the SW to
      // be active, then poll on a fixed interval.
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

  private async checkForUpdate(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    try {
      await navigator.serviceWorker.ready;
      await this.swUpdate.checkForUpdate();
    } catch {
      /* SW not controlling the page yet */
    }
  }

  private promptReload(message = 'A new version is available.'): void {
    if (this.updatePromptOpen) {
      return;
    }

    this.updatePromptOpen = true;

    // Zoneless: VERSION_READY arrives outside Angular — schedule UI on the next render.
    afterNextRender(
      () => {
        const ref = this.snackbar.open(message, 'Reload', { politeness: 'assertive' });

        ref.onAction().subscribe(() => {
          void this.swUpdate.activateUpdate().then(
            () => location.reload(),
            () => location.reload(),
          );
        });

        ref.afterDismissed().subscribe(() => {
          this.updatePromptOpen = false;
        });
      },
      { injector: this.envInjector },
    );
  }
}
