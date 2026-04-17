
export const RACE_TYPES = [
   'Handicap',
   'Pursuit',
   'Level Rating',
] as const;

export type RaceType = typeof RACE_TYPES[number];

/** True when elapsed/corrected handicap numbers are used for ordering/scoring display. */
export function doesRaceRequireHandicap(raceType: RaceType): boolean {
  return raceType === 'Handicap';
}
