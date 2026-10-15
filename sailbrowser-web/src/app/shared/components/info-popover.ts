import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, input, OnDestroy, output, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

let nextId = 0;

const HIDE_DELAY_MS = 150;

/**
 * Info icon that shows projected content in a small panel.
 * Hover or focus previews it; click pins it open until clicked again, Escape or an outside click.
 */
@Component({
  selector: 'app-info-popover',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, MatIconButton, MatIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button matIconButton type="button" class="trigger"
      cdkOverlayOrigin #origin="cdkOverlayOrigin"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-describedby]="open() ? panelId : null"
      (click)="toggle()"
      (mouseenter)="show()" (mouseleave)="scheduleHide()"
      (focus)="show()" (blur)="scheduleHide()"
      (keydown.escape)="close()">
      <mat-icon>info_outline</mat-icon>
    </button>
    <ng-template cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayPush]="true"
      (detach)="close()"
      (overlayOutsideClick)="close()">
      <div class="info-popover-panel" role="tooltip" [id]="panelId"
        (mouseenter)="show()" (mouseleave)="scheduleHide()">
        <ng-content />
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: inline-flex; vertical-align: middle; }
    .trigger {
      --mat-icon-button-state-layer-size: 32px;
      --mat-icon-button-icon-size: 20px;
      --mat-icon-button-icon-color: var(--mat-sys-on-surface-variant);
      padding: 6px;
    }
    .info-popover-panel {
      max-width: min(320px, calc(100vw - 32px));
      padding: 12px 16px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      box-shadow: var(--mat-sys-level2);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class InfoPopover implements OnDestroy {
  readonly label = input('More information');
  /** Emits each time the panel opens, e.g. to load its content on demand. */
  readonly opened = output<void>();

  protected readonly open = signal(false);
  protected readonly panelId = `app-info-popover-${nextId++}`;
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  ];

  private pinned = false;
  private hideTimer?: ReturnType<typeof setTimeout>;

  protected show(): void {
    this.cancelHide();
    this.setOpen();
  }

  protected scheduleHide(): void {
    if (this.pinned) return;
    this.cancelHide();
    this.hideTimer = setTimeout(() => this.open.set(false), HIDE_DELAY_MS);
  }

  protected toggle(): void {
    this.cancelHide();
    if (this.pinned) {
      this.close();
    } else {
      this.pinned = true;
      this.setOpen();
    }
  }

  protected close(): void {
    this.cancelHide();
    this.pinned = false;
    this.open.set(false);
  }

  ngOnDestroy(): void {
    this.cancelHide();
  }

  private setOpen(): void {
    if (this.open()) return;
    this.open.set(true);
    this.opened.emit();
  }

  private cancelHide(): void {
    if (this.hideTimer !== undefined) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
  }
}
