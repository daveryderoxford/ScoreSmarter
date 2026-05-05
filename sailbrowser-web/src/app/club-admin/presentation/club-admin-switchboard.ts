import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Toolbar } from 'app/shared/components/toolbar';
import { RaceCalendarStore } from 'app/race-calender/services/full-race-calander';
import { differenceInDays, isFuture } from 'date-fns';
import { ImportExportContext, ImportExportMenuComponent } from 'app/shared/components/import-export-menu';
import { RaceCalendarCsvService } from 'app/race-calender/services/race-calendar-csv.service';
import { RaceCalendarICalService } from 'app/race-calender/services/race-calendar-ical.service';
import { BoatsCsvService } from 'app/boats/services/boats-csv.service';
import { FleetsCsvService } from 'app/club-tenant/services/fleets-csv.service';
import { ClassesCsvService } from 'app/club-tenant/services/classes-csv.service';
import { ClubStore } from 'app/club-tenant';
import { BoatsStore } from 'app/boats/services/boats.store';

interface AdminResource {
  label: string;
  route: string;
}

interface AdminAction {
  title: string;
  description: string;
  icon: string;
  resources: AdminResource[];
  importExportContexts?: ImportExportContext[];
}

@Component({
  selector: 'app-club-admin-switchboard',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    Toolbar,
    ImportExportMenuComponent
  ],
  templateUrl: './club-admin-switchboard.html',
  styleUrl: './club-admin-switchboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubAdminSwitchboard {
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly raceCalendarCsv = inject(RaceCalendarCsvService);
  private readonly raceCalendarICal = inject(RaceCalendarICalService);
  private readonly boatsCsv = inject(BoatsCsvService);
  private readonly fleetsCsv = inject(FleetsCsvService);
  private readonly classesCsv = inject(ClassesCsvService);
  private readonly clubStore = inject(ClubStore);
  private readonly boatsStore = inject(BoatsStore);

  readonly seasonWarning = computed(() => {
    const allRaces = this.raceCalendarStore.allRaces();
    if (!allRaces || allRaces.length === 0) {
      return 'No races scheduled. You may need to create a new season and series.';
    }

    const futureRaces = allRaces.filter(r => isFuture(r.scheduledStart));
    if (futureRaces.length === 0) {
      return 'All scheduled races are in the past. It is time to create a new season and schedule upcoming series.';
    }

    // Find the latest race in the current schedule
    const latestRace = new Date(Math.max(...futureRaces.map(r => r.scheduledStart.getTime())));
    const daysLeft = differenceInDays(latestRace, new Date());

    if (daysLeft < 21) {
      return `The current scheduled racing season ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}. Please ensure the next season is planned.`;
    }

    return null;
  });

  readonly pastUnverifiedRacesCount = computed(() => {
    const now = new Date();
    return this.raceCalendarStore.allRaces().filter(r => r.scheduledStart < now && r.status !== 'Verified' && r.status !== 'Archived').length;
  });

  readonly actions: AdminAction[] = [
    {
      title: 'Race Calendar',
      description: 'Manage seasons, series schedules, and individual race events.',
      icon: 'calendar_month',
      resources: [
        { label: 'Seasons', route: '/club/seasons' },
        { label: 'Series', route: '/race-calender' },
      ],
      importExportContexts: ['race-calendar']
    },
    {
      title: 'Fleets & Classes',
      description: 'Configure boat classes, fleet divisions',
      icon: 'sailing',
      resources: [
        { label: 'Boats', route: '/boats' },
        { label: 'Classes', route: '/club/classes' },
        { label: 'Fleets', route: '/club/fleets' },
      ],
      importExportContexts: ['boats', 'classes', 'fleets']
    },
    {
      title: 'Scoring Defaults',
      description: 'Set up global scoring rules and handicap schemes.',
      icon: 'settings_suggest',
      resources: [
        { label: 'Defaults', route: '/club-admin/scoring-defaults' },
      ]
    },
    {
      title: 'User Management',
      description: 'Manage club personnel, race officers, and permissions.',
      icon: 'group',
      resources: [
        { label: 'Users', route: '/sys-admin/users' },
      ]
    },
    {
      title: 'Results Management',
      description: 'Data import/export and archiving results.',
      icon: 'archive',
      resources: [
        { label: 'Review Past Races', route: '/club-admin/race-review' },
        { label: 'Archived Results', route: '/results' },
      ],
      importExportContexts: ['results']
    }
  ];

  handleImport(event: { event: Event, context: ImportExportContext }) {
    alert(`Importing ${event.context}: Work in progress. This feature will use the ${event.context} import logic.`);
  }

  handleExport(action: string, context?: ImportExportContext) {
    if (action === 'iCal' && this.raceCalendarStore.allRaces()) {
      const ical = this.raceCalendarICal.buildICal(this.raceCalendarStore.allRaces());
      this.downloadFile(ical, 'race-calendar.ics', 'text/calendar');
      return;
    }

    if (action === 'CSV') {
      let csv = '';
      let filename = 'export.csv';

      switch (context) {
        case 'race-calendar':
          csv = this.raceCalendarCsv.buildCsv(this.raceCalendarStore.allRaces());
          filename = 'race-calendar.csv';
          break;
        case 'boats':
          // BoatsCsvService needs handicap schemes
          csv = this.boatsCsv.buildCsv(this.boatsStore.boats() ?? [], this.clubStore.club().supportedHandicapSchemes);
          filename = 'boats.csv';
          break;
        case 'fleets':
          csv = this.fleetsCsv.buildCsv(this.clubStore.club().fleets ?? []);
          filename = 'fleets.csv';
          break;
        case 'classes':
          csv = this.classesCsv.buildCsv(this.clubStore.club().classes ?? [], this.clubStore.club().supportedHandicapSchemes);
          filename = 'classes.csv';
          break;
      }

      if (csv) {
        this.downloadFile(csv, filename, 'text/csv');
        return;
      }
    }

    alert(`${action} ${context || ''}: Work in progress`);
  }

  private downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
