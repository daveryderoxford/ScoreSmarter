import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Full-height page shell: toolbar on top, remaining space for list/detail
 * (or any other body). Replaces the :host grid from the old layout mixins.
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
