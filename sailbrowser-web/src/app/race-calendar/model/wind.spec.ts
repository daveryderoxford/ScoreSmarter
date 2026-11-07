import { describe, expect, it } from 'vitest';
import { windLabel } from './wind';

describe('windLabel', () => {
  it('joins direction and speed', () => {
    expect(windLabel({ windSpeed: 12, windDirection: 'SW' })).toBe('SW 12 kts');
  });

  it('shows whichever part is set', () => {
    expect(windLabel({ windDirection: 'N' })).toBe('N');
    expect(windLabel({ windSpeed: 0 })).toBe('0 kts');
  });

  it('is empty when neither is set', () => {
    expect(windLabel({})).toBe('');
  });
});
