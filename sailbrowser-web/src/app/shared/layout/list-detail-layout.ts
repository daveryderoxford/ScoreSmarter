import { booleanAttribute, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { AppBreakpoints } from 'app/shared/services/breakpoints';

/**
 * Responsive list/detail shell.
 *
 * Wide (desktop and tablet landscape): left navigation panel + detail panel.
 * Compact (phone and tablet portrait): shows either the list or the detail,
 * so the list screen navigates to a separate detail page.
 */
@Component({
  selector: 'app-list-detail-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.wide]': 'isWide()',
    '[class.compact]': '!isWide()',
    '[class.detail-open]': 'detailOpen()',
    '[class.list-collapsed]': 'isWide() && listCollapsed()',
    '[style.--app-list-pane-width]': 'listWidth()',
  },
  template: `
    <div class="list-slot">
      <ng-content select="[list]" />
    </div>
    <div class="detail-slot">
      <ng-content select="[detail]" />
    </div>
  `,
  styles: `
    :host {
      display: grid;
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      height: 100%;
      width: 100%;
    }

    :host.wide {
      grid-template-columns: var(--app-list-pane-width, 400px) 1fr;
      transition: grid-template-columns 0.3s ease-in-out;
    }

    :host.wide.list-collapsed {
      grid-template-columns: 0 1fr;
    }

    :host.compact {
      grid-template-columns: 1fr;
    }

    .list-slot,
    .detail-slot {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    :host.wide.list-collapsed .list-slot {
      overflow: hidden;
    }

    :host.compact:not(.detail-open) .detail-slot {
      display: none;
    }

    :host.compact.detail-open .list-slot {
      display: none;
    }
  `,
})
export class ListDetailLayout {
  private readonly breakpoints = inject(AppBreakpoints);

  /** True when a detail route/page is active (add/edit/selected item). */
  detailOpen = input(false, { transform: booleanAttribute });

  /** Wide layout only: collapse the list column to 0. */
  listCollapsed = input(false, { transform: booleanAttribute });

  /** Width of the list column on wide screens. */
  listWidth = input('400px');

  protected readonly isWide = this.breakpoints.isWideLayout;
}
