import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthService } from 'app/auth/auth.service';
import { BoatsStore, type Boat } from 'app/boats';
import { ClubStore, ClubTenant } from 'app/club-tenant';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import { RaceCalendarStore, type Race, type Series } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import { SeriesEntryStore } from 'app/results-input/services/series-entry-store';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { UserDataService, type UserData } from 'app/user';
import { EntryService } from '../../services/entry.service';
import { EntryPage } from './entry-page';

const testBoat1: Boat = {
  id: 'b1',
  boatClass: 'ILCA 7',
  sailNumber: '1234',
  helm: 'Alice Smith',
  crew: '',
  name: 'Lightning',
  isClub: false,
};

const testBoat2: Boat = {
  id: 'b2',
  boatClass: 'RS Aero',
  sailNumber: '5678',
  helm: 'Alice Smith',
  crew: '',
  name: 'Breeze',
  isClub: false,
};

const clubClasses: BoatClass[] = [
  { id: 'ILCA 7', name: 'ILCA 7', handicaps: [], isSinglehander: true },
  { id: 'RS Aero', name: 'RS Aero', handicaps: [], isSinglehander: true },
];

const testSeries: Series = {
  id: 's1',
  seasonId: 'season-1',
  name: 'Spring Series',
  archived: false,
  scoringAlgorithm: 'short',
  entryAlgorithm: 'helm',
  discards: [],
  primaryScoringConfiguration: {
    id: 'cfg-py',
    name: 'PY',
    type: 'Handicap',
    handicapScheme: 'PY',
    fleet: { type: 'GeneralHandicap', id: 'f-gen', name: 'General Handicap' },
  },
};

describe('EntryPage self-entry flows', () => {
  let isRaceOfficerSig: ReturnType<typeof signal<boolean>>;
  let loggedInSig: ReturnType<typeof signal<boolean>>;
  let userSig: ReturnType<typeof signal<UserData | undefined>>;
  let racesSig: ReturnType<typeof signal<Race[]>>;

  function setupTestBed(options: {
    isRO?: boolean;
    loggedIn?: boolean;
    userBoats?: Boat[];
    races?: Race[];
  } = {}) {
    isRaceOfficerSig = signal(options.isRO ?? false);
    loggedInSig = signal(options.loggedIn ?? true);
    userSig = signal<UserData | undefined>(
      options.userBoats !== undefined
        ? ({
            id: 'u1',
            role: 'user',
            tenantId: 't1',
            updatedBy: 'u1',
            updatedAt: new Date().toISOString(),
            firstname: 'Alice',
            surname: 'Smith',
            boats: options.userBoats,
          } as UserData)
        : undefined,
    );
    racesSig = signal<Race[]>(options.races ?? []);

    TestBed.configureTestingModule({
      imports: [EntryPage],
      providers: [
        {
          provide: AuthService,
          useValue: {
            isRaceOfficer: isRaceOfficerSig,
            loggedIn: loggedInSig,
            user: signal({ uid: 'u1' }),
          },
        },
        {
          provide: UserDataService,
          useValue: {
            user: userSig,
            recordRecentBoat: async () => {},
          },
        },
        {
          provide: BoatsStore,
          useValue: {
            boats: signal([testBoat1, testBoat2]),
            add: async () => {},
          },
        },
        {
          provide: ClubTenant,
          useValue: { clubId: 'test-club' },
        },
        {
          provide: ClubStore,
          useValue: {
            club: signal({
              classes: clubClasses,
              supportedHandicapSchemes: ['PY'],
            }),
          },
        },
        {
          provide: RaceCalendarStore,
          useValue: {
            allRaces: racesSig,
            allSeries: signal([testSeries]),
          },
        },
        {
          provide: CurrentRaces,
          useValue: {
            addRaceId: () => {},
            todaysRaces: signal([]),
          },
        },
        {
          provide: SeriesEntryStore,
          useValue: {
            getSeriesEntries: async () => [],
            selectedEntries: signal([]),
          },
        },
        {
          provide: EntryService,
          useValue: {
            findEntryConflicts: () => [],
            enterRaces: async () => {},
            swapAndEnter: async () => {},
          },
        },
        {
          provide: DialogsService,
          useValue: {
            promptEntryConflict: async () => 'cancel',
          },
        },
        {
          provide: MatSnackBar,
          useValue: { open: () => {} },
        },
        {
          provide: MatDialog,
          useValue: { open: () => ({ afterClosed: () => signal(undefined) }) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: () => null,
              },
            },
          },
        },
        {
          provide: Router,
          useValue: { navigate: () => Promise.resolve(true) },
        },
      ],
    });

    const fixture = TestBed.createComponent(EntryPage);
    fixture.detectChanges();
    return fixture;
  }

  it('starts on "recent" step for a normal user with stored boats', () => {
    const fixture = setupTestBed({
      isRO: false,
      userBoats: [testBoat1, testBoat2],
    });
    const component = fixture.componentInstance;
    expect(component.hasRecentBoats()).toBe(true);
    expect(component.step()).toBe('recent');
    expect(component.recentBoats()).toEqual([testBoat1, testBoat2]);
  });

  it('starts on "category" step for a normal user with no stored boats', () => {
    const fixture = setupTestBed({
      isRO: false,
      userBoats: [],
    });
    const component = fixture.componentInstance;
    expect(component.hasRecentBoats()).toBe(false);
    expect(component.step()).toBe('category');
  });

  it('starts on "category" step for a race officer even if boats exist', () => {
    const fixture = setupTestBed({
      isRO: true,
      userBoats: [testBoat1],
    });
    const component = fixture.componentInstance;
    expect(component.hasRecentBoats()).toBe(false);
    expect(component.step()).toBe('category');
  });

  it('selecting a recent boat sets selectedBoat and transitions to "races" step', () => {
    const fixture = setupTestBed({
      isRO: false,
      userBoats: [testBoat1, testBoat2],
    });
    const component = fixture.componentInstance;
    component.selectRecentBoat(testBoat1);
    expect(component.selectedBoat()).toEqual(testBoat1);
    expect(component.step()).toBe('races');
  });

  it('selecting "...another boat" transitions to "category" step with cleared boat', () => {
    const fixture = setupTestBed({
      isRO: false,
      userBoats: [testBoat1],
    });
    const component = fixture.componentInstance;
    component.chooseAnotherBoat();
    expect(component.selectedBoat()).toBeNull();
    expect(component.step()).toBe('category');
  });

  it('goBack from races step returns to recent step if started from recent boat', () => {
    const fixture = setupTestBed({
      isRO: false,
      userBoats: [testBoat1],
    });
    const component = fixture.componentInstance;
    component.selectRecentBoat(testBoat1);
    expect(component.step()).toBe('races');

    component.goBack();
    expect(component.step()).toBe('recent');
  });

  it('goBack from category step returns to recent step when user has recent boats', () => {
    const fixture = setupTestBed({
      isRO: false,
      userBoats: [testBoat1],
    });
    const component = fixture.componentInstance;
    component.chooseAnotherBoat();
    expect(component.step()).toBe('category');

    component.goBack();
    expect(component.step()).toBe('recent');
  });

  it('sets racePanelInitialPeriod to null when races exist today, and "future" when no races exist today', () => {
    const now = new Date();
    const todayRace: Race = {
      id: 'r-today',
      seriesId: 's1',
      seriesName: 'Spring Series',
      fleetId: 'f-gen',
      index: 1,
      raceOfDay: 1,
      scheduledStart: now,
      type: 'Handicap',
      status: 'Future',
      isDiscardable: true,
      isAverageLap: false,
      resultsSheetImage: '',
      dirty: false,
    };

    const futureRace: Race = {
      id: 'r-future',
      seriesId: 's1',
      seriesName: 'Spring Series',
      fleetId: 'f-gen',
      index: 2,
      raceOfDay: 1,
      scheduledStart: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      type: 'Handicap',
      status: 'Future',
      isDiscardable: true,
      isAverageLap: false,
      resultsSheetImage: '',
      dirty: false,
    };

    // Case 1: Today + Future race available -> initial period should be null (today)
    const fixture = setupTestBed({
      isRO: false,
      userBoats: [testBoat1],
      races: [todayRace, futureRace],
    });
    const comp = fixture.componentInstance;
    comp.selectRecentBoat(testBoat1);
    fixture.detectChanges();
    expect(comp.racePanelInitialPeriod()).toBeNull();

    // Case 2: Only Future race available -> initial period should be 'future'
    racesSig.set([futureRace]);
    fixture.detectChanges();
    expect(comp.racePanelInitialPeriod()).toBe('future');
  });
});
