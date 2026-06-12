import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ClubLogo } from 'app/shared/components/club-logo/club-logo';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { ClubStore } from 'app/club-tenant';
import { Toolbar } from 'app/shared/components/toolbar';
import { Title } from '@angular/platform-browser';
import { HomeRacesSection } from './home-races-section';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly clubStore = inject(ClubStore);
  private readonly pageTitle = inject(Title);

  title = computed(() => {
    const club = this.clubStore.club();
    return ' ScoreSmarter:  ' + (club.shortName ?? club.name);
  });

  pageTitleEffect = effect(() => this.pageTitle.setTitle(this.title()));
}
