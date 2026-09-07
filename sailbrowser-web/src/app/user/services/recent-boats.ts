import type { Boat } from 'app/boats';
import { sailNumbersEqual } from 'app/boats';

function isSameBoat(a: Boat, b: Boat): boolean {
  if (a.id && b.id && a.id === b.id) {
    return true;
  }
  const aClass = (a.boatClass ?? '').trim().toLowerCase();
  const bClass = (b.boatClass ?? '').trim().toLowerCase();
  return aClass === bClass && sailNumbersEqual(a.sailNumber, b.sailNumber);
}

/**
 * Prepends the most recently entered boat to the user's boat list,
 * deduplicating by id / class + sail number, and capping at `max` (default 5).
 */
export function pushRecentBoat(
  existingBoats: readonly Boat[] | undefined,
  boat: Boat,
  max = 5,
): Boat[] {
  const current = existingBoats ?? [];
  const filtered = current.filter(b => !isSameBoat(b, boat));
  return [boat, ...filtered].slice(0, max);
}
