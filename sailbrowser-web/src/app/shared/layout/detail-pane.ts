import { booleanAttribute, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { AppBreakpoints } from 'app/shared/services/breakpoints';

/**
 * Form or detail column. Replaces the `form-page` mixin when used inside
 * `PageLayout` (recipe 1) or `ListDetailLayout` (recipe 2).
 *
 * On wide screens, framed content is centred at `maxWidth`.
 * On compact screens, framed content is 100% width. Scrolling is optional.
 */
@Component({
  selector: 'app-detail-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.wide]': 'isWide()',
    '[class.compact]': '!isWide()',
    '[class.scrollable]': 'scrollable()',
    '[class.framed]': 'frameContent()',
    '[style.--app-detail-max-width]': 'maxWidth()',
  },
  template: `
    <div class="header">
      <ng-content select="[detailHeader]" />
    </div>
    <div class="viewport">
      <div class="content">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
      background-color: var(--mat-sys-surface-container-high);
      overflow: hidden;
    }

    :host:not(.framed) {
      background-color: var(--mat-sys-surface);
    }

    .header:empty {
      display: none;
    }

    .viewport {
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
    }

    :host.scrollable .viewport {
      overflow-y: auto;
    }

    :host:not(.scrollable) .viewport {
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .content {
      box-sizing: border-box;
      width: 100%;
    }

    :host:not(.scrollable) .content {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host.framed.wide .content {
      max-width: var(--app-detail-max-width, 360px);
      margin: 16px auto;
      padding: 20px;
      background-color: var(--mat-sys-surface);
      border-radius: var(--mat-sys-corner-medium);
      box-shadow: var(--mat-sys-level1);
    }

    :host.framed.compact .content {
      max-width: none;
      width: 100%;
      margin: 0;
      padding: 16px;
    }
  `,
})
export class DetailPane {
  private readonly breakpoints = inject(AppBreakpoints);

  /** When true (default), the viewport scrolls if content overflows. */
  scrollable = input(true, { transform: booleanAttribute });

  /**
   * When true (default), centre form content at `maxWidth` on wide screens
   * and stretch to 100% width on compact screens.
   */
  frameContent = input(true, { transform: booleanAttribute });

  /** Max width of framed form content on wide screens. */
  maxWidth = input('360px');

  protected readonly isWide = this.breakpoints.isWideLayout;
}
