import { Injectable, inject } from '@angular/core';
import { Race, RaceCalendarStore } from 'app/race-calender';
import { ClubStore } from 'app/club-tenant';
import { ResultCode } from 'app/scoring/model/result-code';
import { isFinishedComp } from 'app/scoring/model/result-code-scoring';
import { differenceInSeconds } from 'date-fns';
import { deleteField } from 'firebase/firestore';
import { RaceCompetitorStore, sortEntries } from './race-competitor-store';
import { RaceCompetitor } from '../model/race-competitor';
import { SeriesEntryStore } from './series-entry-store';
import { resolveStartTimeForEntry } from './race-start-resolver';
import type { RaceStart } from 'app/race-calender/model/race-start';

export class ExtendedRaceCompetitor extends RaceCompetitor {
  correctedTime?: number;
}

export interface ResultInput {
  finishTime: Date | null;
  laps: number;
  resultCode: ResultCode;
  position?: number | null;
}

/** Per-row editor state for pursuit / level-rating order entry UI */
export interface OrderEntryRowState {
  resultCode: ResultCode;
  /** Optional finish time for Level Rating (competitor info) */
  manualFinishTime?: Date | null;
  /** When set, overrides default sequential rank among finishers */
  rankOverride?: number | null;
}

export interface OrderEntryPersistInput {
  race: Race;
  /** All competitors for this race (from store) */
  competitors: RaceCompetitor[];
  /** Processed queue order (right pane), first = earliest processed */
  processedIds: string[];
  /** State keyed by competitor id for processed rows */
  rowState: Map<string, OrderEntryRowState>;
}

/**
 * Computes target manualPosition for finishers in processed order (ties share the same value).
 * Non-finishers (per isFinishedComp) get no rank (undefined).
 */
export function computeManualPositionsForOrderEntry(
  processedIds: string[],
  rowState: Map<string, OrderEntryRowState>
): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>();
  let nextDefault = 1;
  for (const id of processedIds) {
    const row = rowState.get(id);
    if (!row) {
      out.set(id, undefined);
      continue;
    }
    const code = row.resultCode;
    if (!isFinishedComp(code)) {
      out.set(id, undefined);
      continue;
    }
    const ov = row.rankOverride;
    if (ov != null && !Number.isNaN(Number(ov))) {
      const p = Number(ov);
      out.set(id, p);
      nextDefault = Math.max(nextDefault, p + 1);
    } else {
      out.set(id, nextDefault);
      nextDefault++;
    }
  }
  return out;
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
  private readonly seriesEntryStore = inject(SeriesEntryStore);
  private readonly clubStore = inject(ClubStore);

  /**
   * Calculates derived statistics for a result entry without persisting them.
   * This is useful for providing immediate feedback to the user in the UI.
   * @returns CalculatedStats or null if inputs are invalid.
   */
  calculateStats(finishTime: Date | null, laps: number, startTime: Date | undefined): CalculatedStats | null {
    if (!finishTime || !startTime || laps <= 0) {
      return null;
    }

    const elapsedSeconds = differenceInSeconds(finishTime, startTime);

    if (elapsedSeconds <= 0) {
      return null;
    }

    const avgLapTime = elapsedSeconds / laps;

    return { elapsedSeconds, avgLapTime };
  }

  /** Set start configuration
   * Sets the race start time, updating any results 
   * where the start time has already been set. 
  */
  async setStartTime(raceId: string, starts: RaceStart[], mode: TimeRecordingMode) {
    const primaryStart = starts[0]?.timeOfDay;

    await this.raceStore.updateRace(raceId, {
      actualStart: primaryStart,
      starts,
      timeInputMode: mode
    });

    const race = this.raceStore.allRaces().find(r => r.id === raceId);
    if (!race) return;

    const entries = await this.seriesEntryStore.getSeriesEntries(race.seriesId);
    const entryById = new Map(entries.map(e => [e.id, e] as const));
    const fleetsById = new Map(this.clubStore.club().fleets.map(f => [f.id, f] as const));

    const comps = this.competitorStore.selectedCompetitors().filter(comp => comp.raceId === raceId);

    for (const comp of comps) {
      const entry = entryById.get(comp.seriesEntryId);
      if (!entry) continue;
      const resolvedStart = resolveStartTimeForEntry(entry, starts, fleetsById, primaryStart);
      if (!resolvedStart) continue;
      await this.competitorStore.updateResult(comp.id, { startTime: resolvedStart });
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

    const starts = race.starts;
    const primaryStart = starts?.[0]?.timeOfDay ?? race.actualStart;
    if (primaryStart) {
      const entries = await this.seriesEntryStore.getSeriesEntries(race.seriesId);
      const entry = entries.find(e => e.id === competitor.seriesEntryId);
      const fleetsById = new Map(this.clubStore.club().fleets.map(f => [f.id, f] as const));
      update.startTime = entry
        ? (resolveStartTimeForEntry(entry, starts, fleetsById, primaryStart) ?? primaryStart)
        : primaryStart;
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

  /**
   * Computes target manualPosition for finishers in processed order.
   * Non-finishers (per isFinishedComp) get no rank (undefined).
   */
  computeManualPositionsForOrderEntry(
    processedIds: string[],
    rowState: Map<string, OrderEntryRowState>
  ): Map<string, number | undefined> {
    return computeManualPositionsForOrderEntry(processedIds, rowState);
  }

  /**
   * Persists order-entry state with diff-only writes (manualPosition, resultCode, manualFinishTime).
   */
  async persistOrderEntryState(input: OrderEntryPersistInput): Promise<void> {
    const { race, competitors, processedIds, rowState } = input;
    const processedSet = new Set(processedIds);
    const positions = computeManualPositionsForOrderEntry(processedIds, rowState);

    const updates: { id: string; patch: Record<string, unknown> }[] = [];

    for (const comp of competitors) {
      const inProcessed = processedSet.has(comp.id);
      const row = rowState.get(comp.id);
      const targetCode: ResultCode = inProcessed && row ? row.resultCode : 'NOT FINISHED';

      const targetManualFinish: Date | undefined | null =
        inProcessed && row ? row.manualFinishTime ?? undefined : undefined;

      const targetMp =
        inProcessed && row && isFinishedComp(targetCode) ? positions.get(comp.id) : undefined;

      const patch: Record<string, unknown> = {};

      if (comp.resultCode !== targetCode) {
        patch['resultCode'] = targetCode;
      }

      const prevTime = comp.manualFinishTime?.getTime();
      const nextTime = targetManualFinish instanceof Date ? targetManualFinish.getTime() : undefined;
      if (prevTime !== nextTime) {
        if (targetManualFinish === undefined || targetManualFinish === null) {
          if (prevTime !== undefined) {
            patch['manualFinishTime'] = deleteField();
          }
        } else {
          patch['manualFinishTime'] = targetManualFinish;
        }
      }

      const prevMp = comp.manualPosition;
      if (targetMp === undefined) {
        if (prevMp !== undefined && prevMp !== null) {
          patch['manualPosition'] = deleteField();
        }
      } else if (prevMp !== targetMp) {
        patch['manualPosition'] = targetMp;
      }

      if (Object.keys(patch).length > 0) {
        updates.push({ id: comp.id, patch });
      }
    }

    if (updates.length === 0) {
      return;
    }

    if (!race.dirty) {
      await this.raceStore.updateRace(race.id, { dirty: true });
    }

    for (const { id, patch } of updates) {
      await this.competitorStore.updateResult(id, patch as Partial<RaceCompetitor>);
    }
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
    
    if (valueA === undefined || valueA === null || valueB === undefined || valueB === null) {
      if (valueA === valueB) {
        ret = 0;
      } else {
        // If one is missing a value, place the one with a value first
        ret = (valueA === undefined || valueA === null) ? 1 : -1;
      }
    } else if (valueA instanceof Date && valueB instanceof Date) {
      ret = valueA.getTime() - valueB.getTime();
    } else if (typeof valueA === 'number') {
      ret = (valueA as number) - (valueB as number);
    } else if (typeof valueA === 'string') {
      ret = valueA.localeCompare(valueB as string);
    } else {
      console.error('ManualResultsPage: Unexpected sort order: ' + finishedOrder);
      ret = 0;
    }
    return (dir === 'asc') ? ret : -ret;
  }
}
