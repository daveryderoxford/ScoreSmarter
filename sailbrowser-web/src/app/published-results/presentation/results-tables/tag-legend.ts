import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  CLUB_TAG_COLORS,
  type ClubTagColor,
  type ClubTagDefinition,
} from 'app/club-tenant/model/club-tag';

/**
 * Compact key for the coloured dots beside helm names in published results.
 * Lays out flush left above the table (see `.table-with-legend`).
 */
@Component({
  selector: 'app-tag-legend',
  standalone: true,
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visibleDefs().length > 0) {
      <div class="tag-legend" role="list" aria-label="Tag colours">
        @for (d of visibleDefs(); track d.id) {
          <span class="tag-legend__item" role="listitem">
            <span
              class="tag-dot"
              [class.tag-dot--neutral]="!d.color"
              [ngStyle]="dotStyle(d.color)"
              aria-hidden="true"
            ></span>
            <span class="tag-legend__label">{{ d.label }}</span>
          </span>
        }
      </div>
    }
  `,
  styleUrls: ['../../../club-tenant/presentation/tags/tag-chip.scss'],
  styles: [`
    :host {
      display: block;
      width: 100%;
      padding-left: 5px;
      box-sizing: border-box;
    }
    .tag-legend {
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
    .tag-legend__item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .tag-legend__label {
      font-weight: 500;
    }
  `],
})
export class TagLegend {
  /** Published snapshot of tag definitions for this series or race. */
  readonly definitions = input<readonly ClubTagDefinition[]>([]);

  /** Same visibility rule as pickers: blank label = omit from legend. */
  protected readonly visibleDefs = computed(() =>
    [...this.definitions()].filter(d => d.label.trim().length > 0).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    ),
  );

  protected dotStyle(color: ClubTagColor | undefined): Record<string, string> {
    if (!color) return {};
    const hex = CLUB_TAG_COLORS[color];
    return {
      'background-color': hex,
    };
  }
}
