import { visibleVerticalCenterTop } from './visible-vertical-center';

describe('visibleVerticalCenterTop', () => {
  it('centers within a fully visible host', () => {
    // Host 0–400 in a viewport 0–800 → visible 0–400, center 200, button top 180
    expect(visibleVerticalCenterTop(0, 400, 0, 800, 40)).toBe(180);
  });

  it('centers within the visible intersection when host is partially off-screen', () => {
    // Host 100–900, viewport 0–500 → visible 100–500 (height 400), center 300
    // relative top = 300 - 100 - 20 = 180
    expect(visibleVerticalCenterTop(100, 900, 0, 500, 40)).toBe(180);
  });

  it('returns null when visible height is smaller than the button', () => {
    expect(visibleVerticalCenterTop(0, 30, 0, 800, 40)).toBeNull();
    expect(visibleVerticalCenterTop(0, 1000, 0, 30, 40)).toBeNull();
  });
});
