import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Scrollable list column. Project a sticky header with `[listHeader]`.
 *
 * Inside `ListDetailLayout`, omit `maxWidth` so the pane fills the list slot.
 * On a standalone list page (recipe 1), pass `maxWidth` to centre the column.
 */
@Component({
  selector: 'app-list-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.constrained]': '!!maxWidth()',
    '[style.--app-list-pane-max-width]': 'maxWidth() || null',
  },
  template: `
    <div class="header">
      <ng-content select="[listHeader]" />
    </div>
    <div class="viewport">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
      background-color: var(--mat-sys-surface);
      overflow: hidden;
    }

    :host.constrained {
      max-width: var(--app-list-pane-max-width);
      width: 100%;
      align-self: center;
    }

    .header:empty {
      display: none;
    }

    .viewport {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
  `,
})
export class ListPane {
  /** When set, centre this pane at the given width (standalone list pages). */
  maxWidth = input<string | undefined>(undefined);
}
