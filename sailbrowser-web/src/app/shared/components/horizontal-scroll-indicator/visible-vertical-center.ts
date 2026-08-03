import { HORIZONTAL_SCROLL_BUTTON_SIZE_PX } from './horizontal-scroll-indicator.constants';

/**
 * Top offset (px, relative to the host) that centers a button in the
 * intersection of the host and the scroll viewport.
 * Returns null when the visible slice is shorter than the button.
 */
export function visibleVerticalCenterTop(
  hostTop: number,
  hostBottom: number,
  viewportTop: number,
  viewportBottom: number,
  buttonSize = HORIZONTAL_SCROLL_BUTTON_SIZE_PX,
): number | null {
  const visibleTop = Math.max(hostTop, viewportTop);
  const visibleBottom = Math.min(hostBottom, viewportBottom);
  const visibleHeight = visibleBottom - visibleTop;
  if (visibleHeight < buttonSize) {
    return null;
  }
  const centerY = (visibleTop + visibleBottom) / 2;
  return centerY - hostTop - buttonSize / 2;
}

/** Nearest ancestor that scrolls vertically, if any. */
export function nearestVerticalScrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const oy = style.overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
      return parent;
    }
    // overflow: auto sets both axes in practice when one is non-visible
    if ((style.overflow === 'auto' || style.overflow === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}
