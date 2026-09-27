import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Default chrome for every routed screen that already has `app-toolbar`.
 *
 * Recipe 1 (single column): `PageLayout` + `ListPane` or `DetailPane`.
 * Recipe 2 (master-detail): `PageLayout` + `ListDetailLayout`.
 *
 * Do not wrap the entry kiosk, phone capture, or nested boat/fleet detail children.
 * See `LAYOUT.md` in this folder.
 */
@Component({
  selector: 'app-page-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <ng-content select="app-toolbar" />
      <div class="body">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }

    .page {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      overflow: hidden;
      background-color: var(--mat-sys-surface-container-low);
    }

    .body {
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
  `,
})
export class PageLayout {}
