import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { CurrentRaces } from 'app/results-input/services/current-races-store';

@Component({
  selector: 'app-home-races-section',
  imports: [MatListModule, DatePipe],
  template: `
    <div class="races-section">
      @if (currentRaces.todaysRaces().length > 0) {
        <h2 class="races-title">Races Today</h2>
        <mat-list>
          @for (race of currentRaces.todaysRaces(); track race.id) {
            <mat-list-item>
              <span matListItemTitle>{{ race.seriesName }} - Race {{ race.raceOfDay }}</span>
              <span matListItemLine>{{ race.scheduledStart | date:'shortTime' }}</span>
            </mat-list-item>
          }
        </mat-list>
      } @else {
        <p class="placeholder">No races scheduled for today.</p>
      }
    </div>
  `,
  styles: `
    @use '@angular/material' as mat;

    .races-section {
      margin-top: 16px;
    }

    .races-title {
      text-align: center;
      font: var(--mat-sys-title-large);
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: 16px;
    }

    .placeholder {
      padding: 15px;
      text-align: center;
      font: var(--mat-sys-body-large);
      color: var(--mat-sys-on-surface-variant);
    }

    :host {
      @include mat.list-overrides((
        list-item-label-text-size: var(--mat-sys-body-large-size),
        list-item-supporting-text-size: var(--mat-sys-body-small-size),
        list-item-trailing-supporting-text-size: var(--mat-sys-body-small-size),
      ));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeRacesSection {
  protected readonly currentRaces = inject(CurrentRaces);
}
