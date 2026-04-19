import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { Race } from 'app/race-calender';
import { ResolvedRaceCompetitor } from 'app/results-input';

interface BoatSeriesSummary {
   seriesName: string;
   raceCount: number;
}

interface BoatEntry {
   boatId: string;
   boatClass: string;
   sailNumber: string;
   helm: string;
   seriesSummaries: BoatSeriesSummary[];
}

@Component({
   selector: 'app-boat-entry-summary',
   imports: [MatListModule],
   template: `
    <mat-list class="dense-list">
      @for (boat of boatEntries(); track boat.boatId) {
         <mat-list-item>
            <span matListItemTitle>
              <span class=gap>{{ boat.boatClass }} {{ boat.sailNumber }}</span>
               <span>{{ boat.helm }}</span>
            </span>
            <span matListItemLine>
         @for (summary of boat.seriesSummaries; track summary.seriesName) {
            <span class=gap>{{ summary.seriesName}} {{ summary.raceCount }} race(s)</span>
         }
      </span>
      </mat-list-item>
      }
   </mat-list>
  `,
   styles: [`
      .gap {
         margin-right: 12px;
      }
  `],
   changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoatEntrySummaryComponent {
   competitors = input.required<ResolvedRaceCompetitor[]>();
   races = input.required<Race[]>();

   boatEntries = computed(() => {
      const competitors = this.competitors();
      const races = this.races();
      const racesById = new Map(races.map(r => [r.id, r]));

      const boats = new Map<string, { comp: ResolvedRaceCompetitor, series: Map<string, number>; }>();

      for (const comp of competitors) {
         const boatId = `${comp.boatClass}-${comp.sailNumber}`;
      if (!boats.has(boatId)) {
        boats.set(boatId, { comp, series: new Map<string, number>() });
      }
      const race = racesById.get(comp.raceId);
      if (race) {
        const seriesMap = boats.get(boatId)!.series;
        seriesMap.set(race.seriesName, (seriesMap.get(race.seriesName) || 0) + 1);
      }
    }

    return Array.from(boats.values()).map(({ comp, series }) => ({
      boatId: `${comp.boatClass}-${comp.sailNumber}`,
      boatClass: comp.boatClass,
      sailNumber: comp.sailNumber,
      helm: comp.helm,
      seriesSummaries: Array.from(series.entries()).map(([seriesName, raceCount]) => ({
        seriesName,
        raceCount,
      })).sort((a, b) => a.seriesName.localeCompare(b.seriesName)),
    })).sort((a,b) => a.boatClass.localeCompare(b.boatClass) || a.sailNumber.toString().localeCompare(b.sailNumber.toString()));
  });
}
