import type { Race } from 'app/race-calender/model/race';
import type { Race as ScoringRace } from 'app/scoring/model/race';

/**
 * Strips app-only Race fields and returns the portable scoring subset.
 */
export function toScoringRace(race: Race): ScoringRace {
  return {
    id: race.id,
    index: race.index,
    scheduledStart: race.scheduledStart,
    actualStart: race.actualStart,
    type: race.type,
    isDiscardable: race.isDiscardable,
    isAverageLap: race.isAverageLap,
  };
}
