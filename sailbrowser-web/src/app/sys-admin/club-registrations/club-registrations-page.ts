import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CenteredText } from 'app/shared/components/centered-text';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { PageLayout } from 'app/shared/layout/page-layout';
import { ClubRegistrationsService } from './club-registrations.service';
import { RegistrationCard } from './registration-card';

@Component({
  selector: 'app-club-registrations-page',
  imports: [MatButtonModule, RouterLink, Toolbar, PageLayout, LoadingCentered, CenteredText, RegistrationCard],
  providers: [ClubRegistrationsService],
  template: `
    <app-page-layout>
      <app-toolbar title="Club registrations">
        <a matButton="text" routerLink="/sys-admin/switchboard">Back</a>
      </app-toolbar>

      @if (service.isLoading() && service.registrations().length === 0) {
        <app-loading-centered />
      } @else if (service.error()) {
        <app-centered-text>Could not load registrations.</app-centered-text>
      } @else if (service.registrations().length === 0) {
        <app-centered-text>No club registrations yet.</app-centered-text>
      } @else {
        <div class="list">
          @for (registration of service.registrations(); track registration.id) {
            <app-registration-card [registration]="registration" />
          }
        </div>
      }
    </app-page-layout>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      width: 100%;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      max-width: 720px;
      width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubRegistrationsPage {
  protected readonly service = inject(ClubRegistrationsService);
}
