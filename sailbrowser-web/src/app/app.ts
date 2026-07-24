import { ChangeDetectionStrategy, Component, effect, inject, OnInit, viewChild } from '@angular/core';
import { RouteConfigLoadEnd, RouteConfigLoadStart, Router, RouterOutlet } from "@angular/router";
import { AppUpdateService } from './shared/services/app-update.service';
import { LazyInject } from './shared/services/lazy-injector';
import { SidenavService } from './shared/services/sidenav.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { SidenavMenu } from './sidenav-menu/presentation/sidenav-menu';
import { FirestoreListenerErrorReporter } from './shared/firebase/firestore-listener-error-reporter';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: 'app.scss',
  imports: [RouterOutlet, SidenavMenu, MatProgressBarModule, MatSidenavModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  protected readonly sidenavService = inject(SidenavService);
  private readonly appUpdate = inject(AppUpdateService);
  private readonly listenerErrors = inject(FirestoreListenerErrorReporter);
  private readonly snackBar = inject(MatSnackBar);
  private readonly lazyInject = inject(LazyInject);
  private readonly router = inject(Router);

  sidenav = viewChild.required(MatSidenav);

  private updateSnackbarOpen = false;
  private listenerErrorSnackbarOpen = false;

  protected isLazyLoading = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof RouteConfigLoadStart || e instanceof RouteConfigLoadEnd),
      map(e => e instanceof RouteConfigLoadStart)
    ),
    { initialValue: false }
  );

  constructor() {
    // Zoneless: SW events set a signal; this effect runs inside the component graph so
    // MatSnackBar renders reliably (afterNextRender from a service often never fires).
    effect(() => {
      const message = this.appUpdate.updateMessage();
      if (!message || this.updateSnackbarOpen) {
        return;
      }

      this.updateSnackbarOpen = true;
      const ref = this.snackBar.open(message, 'Reload', { politeness: 'assertive' });

      ref.onAction().subscribe(() => void this.appUpdate.activateAndReload());

      ref.afterDismissed().subscribe(() => {
        this.updateSnackbarOpen = false;
        this.appUpdate.dismissPrompt();
      });
    });

    effect(() => {
      if (!this.listenerErrors.reloadPrompt() || this.listenerErrorSnackbarOpen) {
        return;
      }

      this.listenerErrorSnackbarOpen = true;
      const detail = this.listenerErrors.lastError();
      const ref = this.snackBar.open(
        'Unexpected error. Reload to continue.',
        'Reload',
        { politeness: 'assertive' },
      );

      ref.onAction().subscribe(() => location.reload());

      ref.afterDismissed().subscribe(() => {
        this.listenerErrorSnackbarOpen = false;
        this.listenerErrors.dismissPrompt();
        if (detail) {
          console.info(
            `[FirestoreListener] User dismissed error prompt for ${detail.name} (${detail.code})`,
          );
        }
      });
    });
  }

  ngOnInit() {
    this.sidenavService.setSidenav(this.sidenav());
    this.appUpdate.initialize();
    this.cookieConsent();
  }

  private async cookieConsent() {
    if (!existsInLocalStorage('cookieConsent')) {
      const snackBar = await this.lazyInject.getProvider(() => import('@angular/material/snack-bar'), 'MatSnackBar');

      snackBar.open("This site uses cookies for analytics purposes.", "Accept").afterDismissed().subscribe(() => {
        saveToLocalStorage('cookieConsent', true);
      });
    }
  }
}

type LocalStorageKey = 'cookieConsent';

function saveToLocalStorage(key: LocalStorageKey, data: boolean) {
  if (data) {
    try {
      localStorage.setItem(key, data.toString());
    } catch (e: any) {
      console.log('App component: Error saving to local storage Key: ' + key + '   ' + e.message);
    }
  }
}

function existsInLocalStorage(key: LocalStorageKey): boolean {
  try {
    const str = localStorage.getItem(key);
    return str !== null;
  } catch (e: any) {
    console.log('App component: Error reading from local storage.  Key: ' + key + '   ' + e.message);
    return false;
  }
}
