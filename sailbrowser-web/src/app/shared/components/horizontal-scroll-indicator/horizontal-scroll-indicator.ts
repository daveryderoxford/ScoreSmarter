import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { HORIZONTAL_SCROLL_BUTTON_SIZE_PX } from './horizontal-scroll-indicator.constants';
import { horizontalScrollAvailability } from './horizontal-scroll-availability';
import { nearestVerticalScrollParent, visibleVerticalCenterTop } from './visible-vertical-center';

export { HORIZONTAL_SCROLL_BUTTON_SIZE_PX } from './horizontal-scroll-indicator.constants';

/**
 * Overlay chevron buttons for a horizontally scrollable container.
 *
 * Place as a sibling of the scroll element inside a shared grid/relative
 * wrapper so this host stretches to the same box. Pass the scrollable
 * element via `targetElement`.
 *
 * Buttons are vertically centered in the currently visible portion of the table.
 */
@Component({
  selector: 'app-horizontal-scroll-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'horizontal-scroll-indicator',
  },
  template: `
    <div class="rail">
      <div class="rail-side">
        @if (canScrollLeft()) {
          <button
            type="button"
            class="scroll-btn scroll-left"
            [style.top.px]="buttonTopPx()"
            (click)="scroll('left')"
            aria-label="Scroll left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline
                points="15 18 9 12 15 6"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        }
      </div>
      <div class="rail-side">
        @if (canScrollRight()) {
          <button
            type="button"
            class="scroll-btn scroll-right"
            [style.top.px]="buttonTopPx()"
            (click)="scroll('right')"
            aria-label="Scroll right"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline
                points="9 18 15 12 9 6"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      pointer-events: none;
      display: block;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      z-index: 2;
    }

    .rail {
      position: relative;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
    }

    .rail-side {
      display: contents;
    }

    .scroll-btn {
      pointer-events: auto;
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(100, 116, 139, 0.5);
      backdrop-filter: blur(1px);
      -webkit-backdrop-filter: blur(1px);
      color: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(30, 41, 59, 0.22);
      box-shadow: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition:
        background 0.2s ease-in-out,
        border-color 0.2s ease-in-out,
        color 0.2s ease-in-out,
        transform 0.2s ease-in-out;
      outline: none;
    }

    .scroll-left {
      left: 12px;
    }

    .scroll-right {
      right: 12px;
    }

    .scroll-btn:hover {
      background: rgba(100, 116, 139, 0.28);
      border-color: rgba(30, 41, 59, 0.35);
      color: rgba(15, 23, 42, 0.9);
      transform: scale(1.08);
    }

    .scroll-btn:focus-visible {
      outline: 2px solid rgba(30, 41, 59, 0.55);
      outline-offset: 2px;
    }

    .scroll-btn svg {
      width: 20px;
      height: 20px;
    }
  `,
})
export class HorizontalScrollIndicator {
  /** Scrollable container to observe and scroll. */
  readonly targetElement = input.required<HTMLElement>();

  /** Pixels to move horizontally per click. */
  readonly scrollDistance = input(250);

  readonly canScrollLeft = signal(false);
  readonly canScrollRight = signal(false);
  /** Button top relative to the overlay host (centered in visible table slice). */
  readonly buttonTopPx = signal(0);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.attach());
  }

  scroll(direction: 'left' | 'right'): void {
    const el = this.targetElement();
    const offset = direction === 'left' ? -this.scrollDistance() : this.scrollDistance();
    el.scrollBy({ left: offset, behavior: 'smooth' });
  }

  private attach(): void {
    const el = this.targetElement();
    const hostEl = this.host.nativeElement;

    const onUpdate = () => this.update();
    el.addEventListener('scroll', onUpdate, { passive: true });
    // Capture scrolls from outer page/panel scrollports (e.g. .tables-scroll).
    document.addEventListener('scroll', onUpdate, { capture: true, passive: true });
    window.addEventListener('resize', onUpdate, { passive: true });

    const resizeObserver = new ResizeObserver(onUpdate);
    resizeObserver.observe(el);
    resizeObserver.observe(hostEl);
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild);
    }

    const mutationObserver = new MutationObserver(onUpdate);
    mutationObserver.observe(el, { childList: true, subtree: true });

    this.destroyRef.onDestroy(() => {
      el.removeEventListener('scroll', onUpdate);
      document.removeEventListener('scroll', onUpdate, { capture: true });
      window.removeEventListener('resize', onUpdate);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    });

    this.update();
  }

  private update(): void {
    const el = this.targetElement();
    const hostEl = this.host.nativeElement;
    const hostRect = hostEl.getBoundingClientRect();
    const viewport = this.viewportRect(hostEl);

    const top = visibleVerticalCenterTop(
      hostRect.top,
      hostRect.bottom,
      viewport.top,
      viewport.bottom,
      HORIZONTAL_SCROLL_BUTTON_SIZE_PX,
    );

    if (top === null || el.clientHeight < HORIZONTAL_SCROLL_BUTTON_SIZE_PX) {
      this.canScrollLeft.set(false);
      this.canScrollRight.set(false);
      return;
    }

    this.buttonTopPx.set(top);

    const { canScrollLeft, canScrollRight } = horizontalScrollAvailability(
      el.scrollLeft,
      el.clientWidth,
      el.scrollWidth,
    );
    this.canScrollLeft.set(canScrollLeft);
    this.canScrollRight.set(canScrollRight);
  }

  private viewportRect(hostEl: HTMLElement): { top: number; bottom: number } {
    const scrollParent = nearestVerticalScrollParent(hostEl);
    if (scrollParent) {
      const rect = scrollParent.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }
    return { top: 0, bottom: window.innerHeight };
  }
}
