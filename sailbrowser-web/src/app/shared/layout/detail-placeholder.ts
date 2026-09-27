import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Empty-state shown in the detail panel when nothing is selected. */
@Component({
  selector: 'app-detail-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>{{ message() }}</p>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 180px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    p {
      margin: 0;
      font: var(--mat-sys-body-large);
    }
  `,
})
export class DetailPlaceholder {
  message = input('Select an item');
}
