import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from 'app/auth/auth.service';
import { CurrentRaces } from 'app/results-input/services/current-races-store';
import { RaceDayActions } from 'app/results-input/services/race-day-actions';

@Component({
  selector: 'app-home-races-section',
  imports: [MatListModule, MatButtonModule, MatIconModule, MatMenuModule, DatePipe],
  template: `
    <div class="races-section">
      @if (currentRaces.todaysRaces().length > 0) {
        <h2 class="races-title">Races Today</h2>
        @if (dayDetails(); as details) {
          <p class="day-details">{{ details }}</p>
        }
        @if (auth.isRaceOfficer()) {
          <div class="day-actions">
            <button matButton="outlined" type="button" (click)="actions.editDayDetails(firstRace()!)">
              <mat-icon>edit_note</mat-icon>
              Race day details
            </button>
            <button matButton="outlined" type="button" (click)="actions.cancelRaces(firstRace()!, true)">
              <mat-icon>event_busy</mat-icon>
              Cancel races
            </button>
          </div>
        }
        <mat-list>
          @for (race of currentRaces.todaysRaces(); track race.id) {
            <mat-list-item [class.cancelled]="race.status === 'Canceled'">
              <span matListItemTitle>{{ race.seriesName }} - Race {{ race.raceOfDay }}</span>
              <span matListItemLine>{{ race.scheduledStart | date:'shortTime' }}</span>
              @if (race.status === 'Canceled') {
                <span matListItemLine class="cancelled-line">
                  Cancelled{{ race.cancellationReason ? ': ' + race.cancellationReason : '' }}
                </span>
              }
              @if (auth.isRaceOfficer()) {
                <button
                  matListItemMeta
                  matIconButton
                  type="button"
                  [matMenuTriggerFor]="raceMenu"
                  [matMenuTriggerData]="{ race }"
                  [attr.aria-label]="'Actions for ' + race.seriesName + ' race ' + race.raceOfDay">
                  <mat-icon>more_vert</mat-icon>
                </button>
              }
            </mat-list-item>
          }
        </mat-list>
        <mat-menu #raceMenu="matMenu">
          <ng-template matMenuContent let-race="race">
            @if (race.status === 'Canceled') {
              <button mat-menu-item type="button" (click)="actions.reinstateRace(race)">
                <mat-icon>restore</mat-icon>
                Reinstate race
              </button>
            } @else {
              <button mat-menu-item type="button" (click)="actions.cancelRaces(race)">
                <mat-icon>event_busy</mat-icon>
                Cancel race
              </button>
            }
          </ng-template>
        </mat-menu>
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
      margin-bottom: 8px;
    }

    .day-details {
      margin: 0 0 8px;
      text-align: center;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .day-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .cancelled [matListItemTitle] {
      text-decoration: line-through;
    }

    .cancelled-line {
      color: var(--mat-sys-error);
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
  protected readonly auth = inject(AuthService);
  protected readonly actions = inject(RaceDayActions);

  protected readonly firstRace = computed(() => this.currentRaces.todaysRaces()[0]);

  /** "Race officer: X · Wind: Y" once either has been set for the day. */
  protected readonly dayDetails = computed(() => {
    const races = this.currentRaces.todaysRaces();
    const raceOfficer = races.find(r => r.raceOfficer)?.raceOfficer;
    const wind = races.find(r => r.wind)?.wind;
    return [raceOfficer && `Race officer: ${raceOfficer}`, wind && `Wind: ${wind}`].filter(Boolean).join(' · ');
  });
}
