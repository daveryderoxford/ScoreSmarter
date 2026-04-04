import { Injectable, inject } from '@angular/core';
import { RaceCalendarStore } from 'app/race-calender';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { ClubStore } from '../../club-tenant';
import { Race } from '../../race-calender/model/race';
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { RaceCompetitorStore } from '../../results-input/services/race-competitor-store';
import { Handicap } from 'app/scoring/model/handicap';
import { buildHandicapsForSeriesEntry } from './entry-handicaps-for-series';

export interface EntryDetails {
  races: Race[];
  helm: string;
  crew?: string;
  boatClass: string;
  sailNumber: number;
  handicaps?: Handicap[];
}

@Injectable({
  providedIn: 'root'
})
export class EntryService {
  private clubStore = inject(ClubStore);
  private raceResultsStore = inject(RaceCompetitorStore);
  private seriesEntryStore = inject(SeriesEntryStore);
  private raceCalanderStore = inject(RaceCalendarStore);

  /** Enter a race
   * throws a ScoreSmarterError exception if the entry is a duplicate.
   */
  async enterRaces(details: EntryDetails): Promise<void> {

    if (this.isDuplicateEntry(details)) {
      throw new ScoreSmarterError("Duplicate entry");
    }

    for (const race of details.races) {
      const series = this.raceCalanderStore.allSeries().find(s => s.id === race.seriesId);
      if (!series) {
        const msg = 'EntryService: Series not found for race: ' + race.toString();
        console.error(msg);
        throw new ScoreSmarterError(msg);
      }

      const handicapsForEntry = buildHandicapsForSeriesEntry(series, {
        boatClassName: details.boatClass,
        handicaps: details.handicaps,
      }, this.clubStore.club().classes);

      const seriesEntryId = 
        await this.createSeriesEntryIfRequired(race, details, handicapsForEntry);

      const competitor: Partial<RaceCompetitor> = {
        raceId: race.id,
        seriesId: race.seriesId,
        seriesEntryId: seriesEntryId,
        helm: details.helm,
        crew: details.crew,
        boatClass: details.boatClass,
        sailNumber: details.sailNumber,
        handicaps: handicapsForEntry,
        resultCode: 'NOT FINISHED'
      };

     await this.raceResultsStore.addResult(competitor);

    }
  }

  /** 
   * Check if a boat (class+sailnumber) is already entered
   * in any of the races being entered.
   * Returns true if a duplicate is found.
   */
  isDuplicateEntry(details: EntryDetails): boolean {
    for (const race of details.races) {
      const dup = this.raceResultsStore.selectedCompetitors().find(comp =>
        comp.boatClass === details.boatClass &&
        comp.raceId === race.id &&
        comp.sailNumber == details.sailNumber);
      if (dup) {
        return true;
      }
    }

    return false;
  }

  /** Finds a series entry if it exists or not 
   */
  async createSeriesEntryIfRequired(race: Race, details: EntryDetails, handicaps: Handicap[]): Promise<string> {
    const seriesEntries = this.seriesEntryStore.selectedEntries()
      .filter(seriesEntry => seriesEntry.seriesId === race.seriesId);

    const series = this.raceCalanderStore.allSeries().find(s => s.id === race.seriesId);
    if (!series) {
      const msg = 'EntryService:  Series not found for race: ' + race.toString();
      console.error(msg);
      throw new ScoreSmarterError(msg);
    }

    let entry;
    switch (series.entryAlgorithm) {
      case 'classSailNumberHelm':
        entry = seriesEntries.find(e =>
          e.boatClass === details.boatClass &&
          e.sailNumber === details.sailNumber &&
          e.helm == details.helm);
        break;
      case 'classSailNumber':
        entry = seriesEntries.find(e =>
          e.boatClass === details.boatClass &&
          e.sailNumber === details.sailNumber);
        break;
      case 'helm':
        entry = seriesEntries.find(e => e.helm === details.helm);
        break;
      default:
        throw new ScoreSmarterError('invalid entry algorithm');
    }
    if (entry) {
      // Keep entry handicaps in sync with scoring scheme set for this series.
      await this.seriesEntryStore.updateEntry(entry.id, { handicaps });
      return entry.id;
    }

    console.log(`EntryService: Adding series entry ${race.seriesName} index: ${race.index}`);
    
    const entryId = await this.seriesEntryStore.addEntry({
      seriesId: race.seriesId,
      helm: details.helm,
      crew: details.crew,
      boatClass: details.boatClass,
      sailNumber: details.sailNumber,
      handicaps,
      tags: [],
    });

    return entryId;

  }
}
