import { DestroyRef, Injectable, inject, isDevMode } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, fromEvent } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackbar = inject(MatSnackBar);
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

    void this.checkForUpdate();

    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (document.visibilityState === 'visible') {
          void this.checkForUpdate();
        }
      });
  }

  private promptReload(message = 'A new version is available.'): void {
    if (this.updatePromptOpen) {
      return;
    }

    this.updatePromptOpen = true;
    const ref = this.snackbar.open(message, 'Reload');

    ref.onAction().subscribe(() => {
      void this.swUpdate.activateUpdate().then(
        () => location.reload(),
        () => location.reload(),
      );
    });

    ref.afterDismissed().subscribe(() => {
      this.updatePromptOpen = false;
    });
  }

  private checkForUpdate(): Promise<boolean> {
    return this.swUpdate.checkForUpdate().catch(() => false);
  }
}
