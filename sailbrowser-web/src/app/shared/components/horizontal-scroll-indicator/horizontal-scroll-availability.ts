/** Pixel margin for sub-pixel rounding when deciding if more scroll remains. */
export const HORIZONTAL_SCROLL_THRESHOLD_PX = 2;

export function horizontalScrollAvailability(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  threshold = HORIZONTAL_SCROLL_THRESHOLD_PX,
): { canScrollLeft: boolean; canScrollRight: boolean } {
  return {
    canScrollLeft: scrollLeft > threshold,
    canScrollRight: scrollLeft + clientWidth < scrollWidth - threshold,
  };
}
