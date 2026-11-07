import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { AppBreakpoints } from 'app/shared/services/breakpoints';

/**
 * Page body under the toolbar that puts the scoring sheet beside the work (results entry or
 * scan review). Wide screens show both side by side; narrower screens show one at a time.
 *
 * Project the work as default content, the sheet with `[sheet]`, and sheet buttons with
 * `[sheetActions]`. The work stays rendered while the sheet covers it, so entry state is kept.
 */
@Component({
  selector: 'app-sheet-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltip],
  host: {
    '[class.side-by-side]': 'sheetOpen() && sideBySide()',
  },
  template: `
    <div class="work-pane" [class.covered]="sheetOpen() && !sideBySide()">
      <ng-content />
    </div>
    @if (sheetOpen()) {
      <section class="sheet-pane" [attr.aria-label]="title()">
        <header class="sheet-pane-bar">
          @if (sideBySide()) {
            <span class="sheet-pane-title">{{ title() }}</span>
          } @else {
            <button matButton type="button" (click)="sheetOpen.set(false)">
              <mat-icon>arrow_back</mat-icon>
              {{ workLabel() }}
            </button>
          }
          <span class="spacer"></span>
          <ng-content select="[sheetActions]" />
          @if (sideBySide()) {
            <button matIconButton type="button" matTooltip="Hide scoring sheet" aria-label="Hide scoring sheet"
              (click)="sheetOpen.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          }
        </header>
        <div class="sheet-pane-body">
          <ng-content select="[sheet]" />
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      height: 100%;
      overflow: hidden;
    }

    .work-pane {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden auto;
    }

    .work-pane.covered {
      display: none;
    }

    .sheet-pane {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--mat-sys-surface);
    }

    :host.side-by-side .sheet-pane {
      flex: 0 0 42%;
      max-width: 760px;
      min-width: 360px;
      border-left: 1px solid var(--mat-sys-outline-variant);
    }

    .sheet-pane-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 48px;
      padding: 0 4px 0 12px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      flex-shrink: 0;
    }

    .sheet-pane-title {
      font: var(--mat-sys-title-small);
    }

    .spacer {
      flex: 1;
    }

    .sheet-pane-body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden auto;
    }
  `,
})
export class SheetWorkspace {
  private readonly breakpoints = inject(AppBreakpoints);

  readonly sheetOpen = model(false);
  readonly title = input('Scoring sheet');
  /** Label of the control that returns from the sheet to the work on narrow screens. */
  readonly workLabel = input('Results');

  protected readonly sideBySide = this.breakpoints.isWideLayout;
}
