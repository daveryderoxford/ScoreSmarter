import { describe, expect, it } from 'vitest';
import { listRating, nextRatingList, ratingListFor, seriesRatingDate, type RatingList } from './rating-list';

const list = (id: string, scheme: RatingList['scheme'], from: string): RatingList => ({
  id, scheme, issuer: 'RYA', name: id, effectiveFrom: new Date(from), ratings: { 191: 1100, 303: 0 },
});
const lists = [
  list('py-2027', 'PY', '2027-03-01'),
  list('py-2026', 'PY', '2026-03-01'),
  list('other-2026', 'IRC', '2026-06-01'),
];

describe('rating lists', () => {
  it('finds the list in force on a date, by scheme', () => {
    expect(ratingListFor(lists, 'PY', new Date('2026-02-28'))).toBeUndefined();
    expect(ratingListFor(lists, 'PY', new Date('2026-03-01'))?.id).toBe('py-2026');
    expect(ratingListFor(lists, 'PY', new Date('2027-06-01'))?.id).toBe('py-2027');
    expect(ratingListFor(lists, 'IRC', new Date('2027-06-01'))?.id).toBe('other-2026');
  });

  it('finds the next list taking effect after a date', () => {
    expect(nextRatingList(lists, 'PY', new Date('2026-10-01'))?.id).toBe('py-2027');
    expect(nextRatingList(lists, 'PY', new Date('2027-03-01'))).toBeUndefined();
  });

  it('reads positive ratings by catalogue id', () => {
    expect(listRating(lists[1], 191)).toBe(1100);
    expect(listRating(lists[1], 303)).toBeUndefined();
    expect(listRating(lists[1], undefined)).toBeUndefined();
    expect(listRating(undefined, 191)).toBeUndefined();
  });

  it('dates a series by its start, or today before it has races', () => {
    const today = new Date('2026-10-30');
    expect(seriesRatingDate({ startDate: new Date('2026-09-01') }, today)).toEqual(new Date('2026-09-01'));
    expect(seriesRatingDate({ startDate: null }, today)).toBe(today);
  });
});
