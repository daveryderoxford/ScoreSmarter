import { describe, expect, it } from 'vitest';
import {
  shouldShowClubColumn,
  withOptionalClubColumn,
} from './results-table-shared';

describe('shouldShowClubColumn', () => {
  it('hides when all clubs are empty', () => {
    expect(shouldShowClubColumn(['', undefined, null, '  '])).toBe(false);
  });

  it('hides when every non-empty club is the same', () => {
    expect(shouldShowClubColumn(['HYC', 'HYC', '', ' HYC '])).toBe(false);
  });

  it('shows when host and visitor clubs differ', () => {
    expect(shouldShowClubColumn(['HYC', 'HYC', 'Lakeside SC'])).toBe(true);
  });

  it('shows when two visitor clubs differ', () => {
    expect(shouldShowClubColumn(['HYC', 'WSC'])).toBe(true);
  });
});

describe('withOptionalClubColumn', () => {
  const base = ['rank', 'name', 'boat', 'handicap', 'total', 'net'];

  it('inserts club after boat when mixed clubs are present', () => {
    expect(withOptionalClubColumn(base, ['HYC', 'WSC'])).toEqual([
      'rank',
      'name',
      'boat',
      'club',
      'handicap',
      'total',
      'net',
    ]);
  });

  it('omits club when only one distinct club is present', () => {
    expect(withOptionalClubColumn(base, ['HYC', 'HYC'])).toEqual(base);
  });

  it('does not duplicate club if already present', () => {
    const withClub = ['rank', 'name', 'boat', 'club', 'handicap'];
    expect(withOptionalClubColumn(withClub, ['HYC', 'WSC'])).toEqual(withClub);
  });
});
