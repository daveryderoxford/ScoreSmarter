import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChip } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { AuthService } from 'app/auth/auth.service';
import type { DutyMember } from 'app/duties';
import { DutiesService } from 'app/duties';

@Component({
  selector: 'app-home-duties-section',
  imports: [MatButtonModule, MatIconModule, MatChip, MatListModule],
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
              <div matListItemMeta>
                @if (auth.loggedIn()) {
                  @if (!member.attending) {
                    <mat-chip (click)="toggleAttending(member)">Check in</mat-chip>
                  } @else {
                    <button
                      matIconButton
                      type="button"
                      [disabled]="isUpdating(member)"
                      [attr.aria-label]="toggleLabel(member)"
                      (click)="toggleAttending(member)">
                      <mat-icon>{{ member.attending ? 'close' : 'check' }}</mat-icon>
                    </button>
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

    .present {
      color: #166534;
    }

    .absent {
      color: var(--mat-sys-on-surface-variant);
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeDutiesSection {
  protected readonly duties = inject(DutiesService);
  protected readonly auth = inject(AuthService);

  reload(): void {
    this.duties.reload();
  }

  isUpdating(member: DutyMember): boolean {
    return this.duties.updatingAckKeys().has(member.key);
  }

  toggleLabel(member: DutyMember): string {
    return member.attending ? `Mark ${member.name} absent` : `Mark ${member.name} present`;
  }

  toggleAttending(member: DutyMember): void {
    void this.duties.setAttending(member, !member.attending);
  }
}
