/**
 * Display metadata for a user-managed tag (e.g. "Gold Fleet", "Under 16").
 *
 * Tag *ids* are the storage key used throughout scoring and persistence; they
 * are stable strings (e.g. `gold`, `u16`). This definition only describes
 * how a tag renders. A blank or missing `label` hides the definition from
 * pickers; existing usages still render with default styling.
 */
export interface ClubTagDefinition {
  /** Stable scoring/storage key, e.g. 'gold'. */
  id: string;
  /** Display label. Blank/missing hides the definition in pickers. */
  label: string;
  /** Chip background colour from the fixed palette. Missing falls back to default styling. */
  color?: ClubTagColor;
}

/** Fixed 8-colour palette for tag chips. Includes the existing medal colours. */
export type ClubTagColor =
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'red';

/** Hex colours used when rendering a `ClubTagColor`. */
export const CLUB_TAG_COLORS: Record<ClubTagColor, string> = {
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  blue: '#1976D2',
  green: '#2E7D32',
  purple: '#7B1FA2',
  orange: '#EF6C00',
  red: '#C62828',
};

/** Ordered list of colour ids, suitable for driving swatch pickers. */
export const CLUB_TAG_COLOR_IDS = Object.keys(CLUB_TAG_COLORS) as readonly ClubTagColor[];
