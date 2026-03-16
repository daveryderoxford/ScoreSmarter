
export const RACE_TYPES = [
   'Handicap',
   'Pursuit',
   'Level Rating',
] as const;

export type RaceType = typeof RACE_TYPES[number];
