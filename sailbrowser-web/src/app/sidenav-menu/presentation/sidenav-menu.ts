import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IsActiveMatchOptions, NavigationEnd, Router, RouterModule } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from 'app/auth';
import { ClubStore } from 'app/club-tenant';
import { currentSeasonEvents } from 'app/events/model/open-event';
import { EventStore } from 'app/events/services/event-store';
import { ClubLogo } from 'app/shared/components/club-logo/club-logo';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { SidenavService } from 'app/shared/services/sidenav.service';
import { UserDataService } from 'app/user/services/user-data.service';
import { filter, map, startWith } from 'rxjs';

const ignoredNavMatch: Pick<IsActiveMatchOptions, 'queryParams' | 'fragment' | 'matrixParams'> = {
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

@Component({
  selector: 'app-sidenav-menu',
  imports: [
    MatListModule,
    MatButtonModule,
    MatDividerModule,
    MatMenuModule,
    RouterModule,
    MatExpansionModule,
    MatIconModule,
    ClubLogo,
  ],
  templateUrl: './sidenav-menu.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    @use '@angular/material' as mat;

    :host {
      display: block;
      height: 100%;
      @include mat.list-overrides((
        list-item-label-text-size: var(--mat-sys-body-medium-size),
        list-item-leading-icon-size: 19px,
        list-item-one-line-container-height: 40px,
      ));
    }

    .sidenav-root {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }

    .sidenav-menu {
      padding: 8px 10px;
    }

    .sidenav-nav-item {
      border-radius: 100px;
    }

    a {
      margin: 5px 0;
    }

    a.sidenav-sub-item {
      margin: 0;
      padding-left: 56px;
      @include mat.list-overrides((
        list-item-one-line-container-height: 32px,
      ));
    }

    .club-branding {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--mat-sys-surface-container-low);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      box-sizing: border-box;
    }

    .club-name {
      margin: 0;
      flex: 1;
      min-width: 0;
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface);
      word-wrap: break-word;
      overflow-wrap: anywhere;
      hyphens: auto;
      line-height: 1.35;
    }

    a.club-name {
      color: var(--mat-sys-primary);
      text-decoration: none;
    }

    a.club-name:hover {
      text-decoration: underline;
    }

    .events-panel {
      --mat-expansion-container-elevation-shadow: none;
      --mat-expansion-container-background-color: transparent;
      --mat-expansion-header-collapsed-state-height: 40px;
      --mat-expansion-header-expanded-state-height: 40px;
      --mat-expansion-header-text-size: var(--mat-sys-body-medium-size);
      --mat-expansion-header-text-weight: inherit;
      --mat-expansion-header-text-tracking: inherit;
      background: transparent;
      box-shadow: none;
      margin: 5px 0;
    }

    .events-panel-title {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    .events-panel-title mat-icon {
      flex: 0 0 auto;
      width: 19px;
      height: 19px;
      font-size: 19px;
    }

    .events-panel-link {
      color: inherit;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .events-panel-link.mdc-list-item--activated,
    .events-panel-link.active {
      color: var(--mat-sys-primary);
    }

    :host ::ng-deep .events-panel .mat-expansion-panel-body {
      padding: 0;
    }

    :host ::ng-deep .events-panel .mat-expansion-panel-header {
      padding-left: 12px;
      border-radius: 100px;
    }

  `],
})
export class SidenavMenu {
  private readonly router = inject(Router);
  private readonly sidenavService = inject(SidenavService);
  private readonly breakpoints = inject(AppBreakpoints);
  protected readonly auth = inject(AuthService);

  protected readonly exactNavMatch: IsActiveMatchOptions = {
    paths: 'exact',
    ...ignoredNavMatch,
  };

  protected readonly prefixNavMatch: IsActiveMatchOptions = {
    paths: 'subset',
    ...ignoredNavMatch,
  };
  private readonly userData = inject(UserDataService);
  protected readonly clubStore = inject(ClubStore);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly seriesResultsLink = computed(() =>
    this.breakpoints.isWideLayout() ? '/results/viewer' : '/results/mobile-results-list',
  );

  protected readonly isSeriesResultsActive = computed(() => {
    const path = this.currentUrl().split('?')[0];
    return path === '/results/mobile-results-list' || path.startsWith('/results/viewer');
  });

  protected readonly club = computed(() => this.clubStore.club());

  private readonly eventStore = inject(EventStore);
  protected readonly currentEvents = computed(() =>
    currentSeasonEvents(this.eventStore.events(), this.club().seasons),
  );

  /** Collapsed until the user opens it, or they are already on an events page. */
  protected readonly eventsPanelExpanded = signal(false);

  constructor() {
    effect(() => {
      const path = this.currentUrl().split('?')[0];
      if (path === '/events' || path.startsWith('/events/')) {
        this.eventsPanelExpanded.set(true);
      }
    });
  }

  protected readonly clubDisplayName = computed(
    () => this.club().shortName?.trim() || this.club().name,
  );

  protected readonly clubWebsiteUrl = computed(() => normalizeWebsiteUrl(this.club().websiteUrl));

  readonly accountTitle = computed(() => {
    const data = this.userData.user();
    const name = [data?.firstname, data?.surname].filter(Boolean).join(' ').trim();
    if (name) return name;
    return this.auth.user()?.displayName || 'My account';
  });

  onClubWebsiteClick(event: MouseEvent): void {
    event.stopPropagation();
    this.sidenavService.close();
  }

  onNavClick(): void {
    this.sidenavService.close();
  }

  async logout(): Promise<void> {
    if (this.router.url.includes('admin')) {
      await this.router.navigate(['/']);
    }

    await this.auth.signOut();
    await this.sidenavService.close();
  }
}

function normalizeWebsiteUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
