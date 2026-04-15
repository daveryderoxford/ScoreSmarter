import { Injectable, inject } from '@angular/core';
import { RaceCalendarStore } from 'app/race-calender';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import { ClubStore } from '../../club-tenant';
import { Race } from '../../race-calender/model/race';
import { RaceCompetitor } from '../../results-input/model/race-competitor';
import { RaceCompetitorStore } from '../../results-input/services/race-competitor-store';
import { Handicap } from 'app/scoring/model/handicap';
import { PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { resolveHandicapsForSeries } from './entry-helpers';

export interface EntryDetails {
  races: Race[];
  helm: string;
  crew?: string;
  boatClass: string;
  sailNumber: number;
  handicaps?: Handicap[];
  personalHandicapBand?: PersonalHandicapBand;
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

      const handicapsForEntry = resolveHandicapsForSeries(series, {
        boatClassName: details.boatClass,
        handicaps: details.handicaps,
        personalHandicapBand: details.personalHandicapBand,
        personalHandicapUnknown: !details.personalHandicapBand,
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
        personalHandicapBand: details.personalHandicapBand,
        resultCode: 'NOT FINISHED'
      };

     await this.raceResultsStore.addResult(competitor);

    }
  }

  /** 
   * Check if an entry matching the series entry algorithm is already entered
   * in any of the races being entered.
   * Returns true if a duplicate is found.
   */
  isDuplicateEntry(details: EntryDetails): boolean {
    const normalize = (v: string | undefined) => (v ?? '').trim().toLowerCase();
    const incoming = {
      boatClass: normalize(details.boatClass),
      sailNumber: details.sailNumber,
      helm: normalize(details.helm),
    };

    for (const race of details.races) {
      const series = this.raceCalanderStore.allSeries().find(s => s.id === race.seriesId);
      const dup = this.raceResultsStore.selectedCompetitors().find(comp => {
        if (comp.raceId !== race.id) return false;
        const existing = {
          boatClass: normalize(comp.boatClass),
          sailNumber: comp.sailNumber,
          helm: normalize(comp.helm),
        };

        switch (series?.entryAlgorithm) {
          case 'classSailNumberHelm':
            return existing.boatClass === incoming.boatClass &&
              existing.sailNumber === incoming.sailNumber &&
              existing.helm === incoming.helm;
          case 'classSailNumber':
            return existing.boatClass === incoming.boatClass &&
              existing.sailNumber === incoming.sailNumber;
          case 'helm':
            return existing.helm === incoming.helm;
          default:
            // Safe fallback for legacy/unknown configs.
            return existing.boatClass === incoming.boatClass &&
              existing.sailNumber === incoming.sailNumber;
        }
      });
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
      await this.seriesEntryStore.updateEntry(entry.id, {
        handicaps,
        personalHandicapBand: details.personalHandicapBand,
        tags: this.withPersonalBandTag(entry.tags, details.personalHandicapBand),
      });
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
      personalHandicapBand: details.personalHandicapBand,
      tags: this.withPersonalBandTag([], details.personalHandicapBand),
    });

    return entryId;

  }

  private withPersonalBandTag(tags: string[] | undefined, band: PersonalHandicapBand | undefined): string[] {
    const next = new Set((tags ?? []).filter(t => !t.startsWith('personal-band:')));
    if (band) next.add(`personal-band:${band}`);
    return [...next];
  }
}
