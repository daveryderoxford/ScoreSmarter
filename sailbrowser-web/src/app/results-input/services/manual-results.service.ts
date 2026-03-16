import { Injectable, inject } from '@angular/core';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { ResultCode } from 'app/scoring/model/result-code';
import { differenceInSeconds } from 'date-fns';
import { RaceCompetitorStore, sortEntries } from './race-competitor-store';
import { RaceCompetitor } from '../model/race-competitor';

export class ExtendedRaceCompetitor extends RaceCompetitor {
  correctedTime?: number;
}

export interface ResultInput {
  finishTime: Date | null;
  laps: number;
  resultCode: ResultCode;
  position?: number | null;
}

export interface CalculatedStats {
  elapsedSeconds: number;
  avgLapTime: number;
}

export type TimeRecordingMode = 'tod' | 'elapsed';

@Injectable({
  providedIn: 'root'
})
export class ManualResultsService {
  private readonly competitorStore = inject(RaceCompetitorStore);
  private readonly raceStore = inject(RaceCalendarStore);

  /**
   * Calculates derived statistics for a result entry without persisting them.
   * This is useful for providing immediate feedback to the user in the UI.
   * @returns CalculatedStats or null if inputs are invalid.
   */
  calculateStats(finishTime: Date | null, laps: number, race: Race | undefined): CalculatedStats | null {
    if (!finishTime || !race?.actualStart || laps <= 0) {
      return null;
    }

    const elapsedSeconds = differenceInSeconds(finishTime, race.actualStart);

    if (elapsedSeconds <= 0) {
      return null;
    }

    const avgLapTime = elapsedSeconds / laps;

    return { elapsedSeconds, avgLapTime };
  }

  /** Set Start time 
   * Sets the race start time, updating any results 
   * where the start time has already been set. 
  */
  async setStartTime(raceId: string, startTime: Date, mode: TimeRecordingMode) {

    await this.raceStore.updateRace(raceId, {
      actualStart: startTime,
      timeInputMode: mode
    });

    // Update any competitors for the race that have already been saved 
    // TODO needs update to support multiple start times/race
    const comps = this.competitorStore.selectedCompetitors()
      .filter(comp => comp.raceId == raceId && comp.startTime);

    for (const comp of comps) {
      this.competitorStore.updateResult(comp.id, { startTime: startTime });
    }

  }

  /**
   * Processes and saves a single competitor's result.
   * It calculates derived values and updates the competitor in the store.
   */
  async recordResult(competitor: RaceCompetitor, race: Race, input: ResultInput): Promise<void> {
    const { finishTime, laps, resultCode, position } = input;

    const update: Partial<RaceCompetitor> = {
      resultCode: resultCode,
    };

    if (race.actualStart) {
      update.startTime = race.actualStart;
    }

    if (finishTime) {
      update.manualFinishTime = finishTime;
    }

    if (laps) {
      update.manualLaps = laps;
    }

    if (position) {
      update.manualPosition = position;
    }

    // Set a dirty flag on the race to indicate that its results have changed
    // and may need re-scoring. We can build on this later.
    if (!race.dirty) {
      await this.raceStore.updateRace(race.id, { dirty: true });
    }

    await this.competitorStore.updateResult(competitor.id, update);
  }
}

/** Sorts partially completed results
 * Unfinished competitors are placed at the top sorted by class/sail number
 * followed by finished competitors sorted by key value. 
 */
export function manualRaceTableSort(
  a: ExtendedRaceCompetitor,
  b: ExtendedRaceCompetitor,
  finishedOrder: keyof ExtendedRaceCompetitor,
  dir: 'asc' | 'desc' | ''
): number {

  const aAwaitingResult = a.resultCode === 'NOT FINISHED';
  const bAwaitingResult = b.resultCode === 'NOT FINISHED';

  if (aAwaitingResult !== bAwaitingResult) {
    // If one has a result and the other doesnt, one with no result goes first
    return aAwaitingResult ? -1 : 1;
  } else if (aAwaitingResult && bAwaitingResult) {
    // Neither have a result sort by class / boat
    return sortEntries(a, b);
  } else {
    // Both have a result, so sort them accordingly
    return sortCompetitorsWithResult(a, b, finishedOrder, dir);
  }
}

export function sortCompetitorsWithResult(
  a: ExtendedRaceCompetitor,
  b: ExtendedRaceCompetitor,
  finishedOrder: keyof ExtendedRaceCompetitor,
  dir: 'asc' | 'desc' | ''
): number {

  if ((a.resultCode === 'OK') !== (b.resultCode === 'OK')) {
    /* If one is OK and the other not put the OK first  */
    return (a.resultCode === 'OK') ? -1 : 1;
  } else {
    // Both competitors OK - order by specified parameter
    const valueA = a[finishedOrder];
    const valueB = b[finishedOrder];
    let ret = 0;
    if (valueA instanceof Date && valueB instanceof Date) {
      ret = valueA.getTime() - valueB.getTime();
    } else if (typeof valueA === 'number') {
      ret = (valueA as number) - (valueB as number);
    } else if (typeof valueA === 'string') {
      ret = valueA.localeCompare(valueB as string);
    } else {
      console.error('ManualResultsPage: Unexpected sort order' + finishedOrder);
      ret = 0;
    }
    return (dir === 'asc') ? ret : -ret;
  }
}
