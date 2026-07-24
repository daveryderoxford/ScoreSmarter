import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ClubLogo } from 'app/shared/components/club-logo/club-logo';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { ClubStore, ClubTenant } from 'app/club-tenant';
import { DUTY_REGISTER_CLUB_ID } from 'app/duties';
import { Toolbar } from 'app/shared/components/toolbar';
import { Title } from '@angular/platform-browser';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { HomeRacesSection } from './home-races-section';
import { HomeDutiesSection } from './home-duties-section';

@Component({
  selector: 'app-home',
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.scss'],
  imports: [
    Toolbar,
    MatButtonModule,
    RouterLink,
    MatIconModule,
    MatCardModule,
    MatMenuModule,
    ClubLogo,
    HomeRacesSection,
    HomeDutiesSection,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly clubStore = inject(ClubStore);
  private readonly clubTenant = inject(ClubTenant);
  private readonly pageTitle = inject(Title);
  private readonly breakpoints = inject(AppBreakpoints);

  protected readonly showDuties = computed(() => this.clubTenant.clubId === DUTY_REGISTER_CLUB_ID);

  protected readonly seriesResultsLink = computed(() =>
    this.breakpoints.isMobile() ? '/results/mobile-results-list' : '/results/viewer',
  );

  title = computed(() => {
    const club = this.clubStore.club();
    return ' ScoreSmarter:  ' + (club.shortName ?? club.name);
  });

  pageTitleEffect = effect(() => this.pageTitle.setTitle(this.title()));
}
