import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IsActiveMatchOptions, Router, RouterModule } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from 'app/auth';
import { ClubStore } from 'app/club-tenant';
import { ClubLogo } from 'app/shared/components/club-logo/club-logo';
import { SidenavService } from 'app/shared/services/sidenav.service';
import { UserDataService } from 'app/user/services/user-data.service';

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

  `],
})
export class SidenavMenu {
  private readonly router = inject(Router);
  private readonly sidenavService = inject(SidenavService);
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

  protected readonly club = computed(() => this.clubStore.club());

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
