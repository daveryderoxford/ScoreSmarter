
export const HANDICAP_SCHEMES = [
  "Level Rating", 
  "PY",
  'IRC',
  'YTC',
  'YTC Spinnaker',
  'Personal'
 ] as const;

 /** Handicap system used to hamdicap between different boat types */
export type HandicapScheme = typeof HANDICAP_SCHEMES[number];
