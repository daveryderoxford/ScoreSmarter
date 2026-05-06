import { describe, expect, it } from 'vitest';
import { scoreSeriesSnapshot } from './public-api';
import * as model from 'app/scoring/model';

describe('scoring core portability boundary', () => {
  it('exposes pure scoring API and model symbols', () => {
    expect(typeof scoreSeriesSnapshot).toBe('function');
    expect(model.RESULT_CODES.length).toBeGreaterThan(0);
  });
});
