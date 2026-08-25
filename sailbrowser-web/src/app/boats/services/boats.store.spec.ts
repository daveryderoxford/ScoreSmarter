import { uniqueHelmNamesFromBoats } from './boats.store';
import type { Boat } from '../model/boat';

function boat(helm: string): Boat {
  return {
    id: 'b1',
    boatClass: 'ILCA 7',
    sailNumber: '1',
    helm,
    crew: '',
    name: '',
    isClub: false,
  };
}

describe('uniqueHelmNamesFromBoats', () => {
  it('returns unique trimmed names sorted case-insensitively', () => {
    const names = uniqueHelmNamesFromBoats([
      boat('Zara'),
      boat('  alice  '),
      boat('Alice'),
      boat(''),
      boat('Bob'),
    ]);
    expect(names).toEqual(['alice', 'Bob', 'Zara']);
  });
});
