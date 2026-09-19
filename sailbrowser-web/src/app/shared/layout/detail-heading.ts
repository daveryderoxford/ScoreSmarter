import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppBreakpoints } from 'app/shared/services/breakpoints';

/**
 * Heading for add/edit detail content. Hidden on compact screens where the
 * page toolbar already shows the title.
 */
@Component({
  selector: 'app-detail-heading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isWide()) {
      <h2><ng-content /></h2>
    }
  `,
  styles: `
    h2 {
      margin: 0 0 16px;
      font: var(--mat-sys-headline-small);
    }
  `,
})
export class DetailHeading {
  protected readonly isWide = inject(AppBreakpoints).isWideLayout;
}
