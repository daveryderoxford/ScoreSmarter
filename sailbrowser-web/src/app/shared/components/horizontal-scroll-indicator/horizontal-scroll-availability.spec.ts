import { horizontalScrollAvailability } from './horizontal-scroll-availability';

describe('horizontalScrollAvailability', () => {
  it('hides both buttons when content fits', () => {
    expect(horizontalScrollAvailability(0, 400, 400)).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  it('shows only right when at the start of overflow', () => {
    expect(horizontalScrollAvailability(0, 400, 800)).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
  });

  it('shows only left when at the end of overflow', () => {
    expect(horizontalScrollAvailability(400, 400, 800)).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });
  });

  it('shows both when scrolled in the middle', () => {
    expect(horizontalScrollAvailability(200, 400, 800)).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    });
  });

  it('treats near-zero scrollLeft as left-disabled (sub-pixel)', () => {
    expect(horizontalScrollAvailability(1, 400, 800).canScrollLeft).toBe(false);
    expect(horizontalScrollAvailability(3, 400, 800).canScrollLeft).toBe(true);
  });
});
