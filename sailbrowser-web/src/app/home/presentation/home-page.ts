import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ClubLogo } from 'app/shared/components/club-logo/club-logo';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { ClubStore } from 'app/club-tenant';
import { DutiesService } from 'app/duties';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';
import { Title } from '@angular/platform-browser';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { HomeRacesSection } from './home-races-section';
import { HomeDutiesSection } from './home-duties-section';
import { AuthService } from 'app/auth';

@Component({
  selector: 'app-home',
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.scss'],
  imports: [
    Toolbar,
    PageLayout,
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
  private readonly duties = inject(DutiesService);
  protected readonly auth = inject(AuthService);
  private readonly pageTitle = inject(Title);
  private readonly breakpoints = inject(AppBreakpoints);

  protected readonly showDuties = computed(() => this.duties.hasDutyTeam());

  protected readonly seriesResultsLink = computed(() =>
    this.breakpoints.isWideLayout() ? '/results/viewer' : '/results/mobile-results-list',
  );

  title = computed(() => {
    const club = this.clubStore.club();
    return ' ScoreSmarter:  ' + (club.shortName ?? club.name);
  });

  pageTitleEffect = effect(() => this.pageTitle.setTitle(this.title()));
}
