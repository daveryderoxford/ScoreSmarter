import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { raceStatusLabel, type RaceStatus } from '../../model/race-status';
import { resultsStateLabel, type ResultsState } from '../../model/results-state';
import type { SeriesStatus } from '../../model/series-status';

type PillTone = 'neutral' | 'active' | 'done' | 'warn' | 'cancelled';

const TONES: Record<RaceStatus | SeriesStatus | ResultsState, PillTone> = {
  'Future': 'neutral',
  'In progress': 'active',
  'Completed': 'done',
  'Canceled': 'cancelled',
  'provisional': 'warn',
  'final': 'done',
};

/** Small coloured pill for a race status, series status or results state. */
@Component({
  selector: 'app-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-tone]': 'tone()',
  },
  template: `{{ label() }}`,
  styles: `
    :host {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font: var(--mat-sys-label-small);
      line-height: 18px;
      white-space: nowrap;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }

    :host([data-tone='active']) {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    :host([data-tone='done']) {
      background: #dcfce7;
      color: #166534;
    }

    :host([data-tone='warn']) {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }

    :host([data-tone='cancelled']) {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class StatusPill {
  readonly status = input.required<RaceStatus | SeriesStatus | ResultsState>();

  protected readonly tone = computed(() => TONES[this.status()] ?? 'neutral');

  protected readonly label = computed(() => {
    const status = this.status();
    if (status === 'provisional' || status === 'final') return resultsStateLabel(status);
    return raceStatusLabel(status);
  });
}
