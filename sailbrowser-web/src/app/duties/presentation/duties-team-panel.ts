import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChip } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';
import { AuthService } from 'app/auth/auth.service';
import type { RaceDayDutyMember } from '@shared/race-day';
import { DutiesService } from '../services/duties.service';

@Component({
  selector: 'app-duties-team-panel',
  imports: [MatButtonModule, MatChip, MatListModule],
  template: `
    <div class="duties-section">
      <h2 class="duties-title">Duty Team</h2>

      @if (duties.loading()) {
        <p class="placeholder">Loading duty team…</p>
      } @else if (duties.error(); as errorMessage) {
        <p class="error-text">{{ errorMessage }}</p>
        <button matButton type="button" (click)="reload()">Retry</button>
      } @else if (duties.duties().length === 0) {
        <p class="placeholder">No duty team today.</p>
      } @else {
        <mat-list>
          @for (member of duties.duties(); track member.key) {
            <mat-list-item>
              <span matListItemTitle>{{ member.name }}</span>
              <span matListItemLine class="duty-role">{{ member.role }}</span>
              <div matListItemMeta class="duty-actions">
                @if (auth.loggedIn()) {
                  @if (member.status === 'confirmed') {
                    <span class="present">Confirmed</span>
                  } @else {
                    <mat-chip (click)="checkIn(member)">Check in</mat-chip>
                  }
                }
              </div>
            </mat-list-item>
          }
        </mat-list>
      }
    </div>
  `,
  styles: `
    @use '@angular/material' as mat;

    .duties-section {
      margin-top: 16px;
    }

    .duties-title {
      text-align: center;
      font: var(--mat-sys-title-large);
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: 16px;
    }

    .duty-role {
      text-transform: capitalize;
    }

    .duty-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 5.5rem;
    }

    .present {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 32px;
      width: 100%;
      margin-top: -15px;
      font: var(--mat-sys-title-small);
      font-weight: 600;
      color: #166534;
      text-align: center;
    }

    .placeholder {
      padding: 15px;
      text-align: center;
      font: var(--mat-sys-body-large);
      color: var(--mat-sys-on-surface-variant);
    }

    .error-text {
      margin: 0 0 12px;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font: var(--mat-sys-body-medium);
    }

    :host {
      @include mat.list-overrides((
        list-item-label-text-size: var(--mat-sys-body-large-size),
        list-item-supporting-text-size: var(--mat-sys-body-small-size),
        list-item-trailing-supporting-text-size: var(--mat-sys-body-small-size),
      ));
    }
  `,
})
export class DutiesTeamPanel {
  protected readonly duties = inject(DutiesService);
  protected readonly auth = inject(AuthService);

  readonly confirmed = output<RaceDayDutyMember>();

  reload(): void {
    this.duties.reload();
  }

  async checkIn(member: RaceDayDutyMember): Promise<void> {
    const ok = await this.duties.setStatus(member, 'confirmed');
    if (ok) {
      this.confirmed.emit({ ...member, status: 'confirmed' });
    }
  }
}
