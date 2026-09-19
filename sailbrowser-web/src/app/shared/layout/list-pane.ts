import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Left-hand navigation/list panel. Project a sticky header with `[listHeader]`.
 */
@Component({
  selector: 'app-list-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
export class ListPane {}
