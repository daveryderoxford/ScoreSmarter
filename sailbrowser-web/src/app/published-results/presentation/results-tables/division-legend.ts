import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { legendDivisions, type Division } from 'app/race-calender/model/division';

@Component({
  selector: 'app-division-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visibleDefs().length > 0) {
      <div class="division-legend" role="list" aria-label="Division colours">
        @for (d of visibleDefs(); track d.id) {
          <span class="division-legend__item" role="listitem">
            <span
              class="division-dot"
              [class.division-dot--neutral]="!d.display.markerColor"
              [style.background-color]="d.display.markerColor || null"
              aria-hidden="true"
            ></span>
            <span class="division-legend__label">{{ d.name }}</span>
          </span>
        }
      </div>
    }
  `,
  styleUrls: ['../../../club-tenant/presentation/divisions/division-chip.scss'],
  styles: [`
    :host {
      display: block;
      width: 100%;
      padding-left: 5px;
      box-sizing: border-box;
    }
    .division-legend {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-start;
      align-items: center;
      column-gap: 12px;
      row-gap: 2px;
      font-size: 0.7rem;
      line-height: 1.3;
      color: var(--mat-sys-on-surface-variant);
    }
    .division-legend__item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .division-legend__label {
      font-weight: 500;
    }
  `],
})
export class DivisionLegend {
  readonly definitions = input<readonly Division[]>([]);

  protected readonly visibleDefs = computed(() => legendDivisions(this.definitions()));
}
