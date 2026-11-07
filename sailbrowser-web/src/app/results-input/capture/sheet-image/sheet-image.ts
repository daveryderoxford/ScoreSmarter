import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ImageViewerComponent } from 'app/shared/components/image-viewer';

/**
 * A scoring sheet image filling its container, read from the top at full width. Shows a
 * message while it loads, when it fails, or when there is no image; content projected here
 * is added below the no-image message.
 */
@Component({
  selector: 'app-sheet-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImageViewerComponent],
  template: `
    @if (src(); as url) {
      <app-image-viewer [src]="url" fit="width" />
    } @else if (error(); as message) {
      <p class="sheet-message" role="alert">{{ message }}</p>
    } @else if (loading()) {
      <p class="sheet-message">Loading scoring sheet…</p>
    } @else {
      <div class="sheet-message">
        <p>{{ emptyMessage() }}</p>
        <ng-content />
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }

    app-image-viewer {
      flex: 1 1 auto;
      min-height: 0;
    }

    .sheet-message {
      margin: auto;
      padding: 24px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SheetImage {
  readonly src = input<string | null>(null);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly emptyMessage = input('No scoring sheet image.');
}
