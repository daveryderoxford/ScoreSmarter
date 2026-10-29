import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { ListDetailLayout } from './list-detail-layout';

/**
 * Heading for add/edit detail content. Hidden when the detail has the screen to
 * itself, where the page toolbar already shows the title.
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
  private readonly breakpoints = inject(AppBreakpoints);
  private readonly layout = inject(ListDetailLayout, { optional: true });

  protected readonly isWide = computed(() =>
    this.layout ? this.layout.isWide() : this.breakpoints.isWideLayout());
}
