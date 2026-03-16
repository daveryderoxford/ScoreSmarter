import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { CurrentRaces } from '../../results-input/services/current-races-store';
import { ClubStore } from 'app/club-tenant';
import { Toolbar } from 'app/shared/components/toolbar';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.scss'],
  imports: [
    Toolbar,
    MatButtonModule,
    RouterLink,
    MatListModule,
    DatePipe,
    MatIconModule,
    MatCardModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly currentRacesStore = inject(CurrentRaces);
  protected readonly clubStore = inject(ClubStore);
  private readonly pageTitle = inject(Title);

  title = computed( () => {
    const club = this.clubStore.club();
    return ' ScoreSmarter:  ' + (club.shortName ?? club.name);
      });

  pageTitleEffect = effect(() => 
    this.pageTitle.setTitle(this.title()));

}