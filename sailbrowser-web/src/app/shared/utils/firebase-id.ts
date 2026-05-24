/**
 * Sanitises a string for use as a Firestore document id segment.
 * Trims, lowercases, replaces whitespace and invalid characters with `-`,
 * then collapses repeated dashes.
 */
export function toFirebaseId(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
