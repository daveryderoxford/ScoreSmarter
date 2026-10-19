import { Component, computed, input, output } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { DatePipe } from '@angular/common';
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from '@angular/material/button';
import { Race } from 'app/race-calender';
import type { RaceStatus } from 'app/race-calender/model/race-status';

type StatusTone = 'neutral' | 'active' | 'done' | 'warn' | 'cancelled';

const STATUS_TONES: Record<RaceStatus, StatusTone> = {
  'Future': 'neutral',
  'In progress': 'active',
  'Completed': 'done',
  'Published': 'done',
  'Verified': 'done',
  'Postponed': 'warn',
  'Canceled': 'cancelled',
  'Archived': 'neutral',
};

@Component({
  selector: 'app-race-list-item',
  imports: [MatListModule, DatePipe, MatIconModule, MatButtonModule],
  templateUrl: './race-list-item.html',
  styles: `
  .gap {
    margin-right: 15px;
  }

  .start-time {
    font-weight: 600;
  }

  .details-line {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .status-pill {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 999px;
    font: var(--mat-sys-label-small);
    line-height: 18px;
    background: var(--mat-sys-surface-container-highest);
    color: var(--mat-sys-on-surface-variant);
  }

  .status-pill[data-status='active'] {
    background: var(--mat-sys-primary-container);
    color: var(--mat-sys-on-primary-container);
  }

  .status-pill[data-status='done'] {
    background: #dcfce7;
    color: #166534;
  }

  .status-pill[data-status='warn'] {
    background: var(--mat-sys-tertiary-container);
    color: var(--mat-sys-on-tertiary-container);
  }

  .status-pill[data-status='cancelled'] {
    background: var(--mat-sys-error-container);
    color: var(--mat-sys-on-error-container);
  }
  `,
})
export class RaceListItem {
  race = input.required<Race>();
  disableDelete = input<boolean>(false);
  edit = output<Race>();
  delete = output<Race>();

  protected readonly statusTone = computed(() => STATUS_TONES[this.race().status] ?? 'neutral');
}
