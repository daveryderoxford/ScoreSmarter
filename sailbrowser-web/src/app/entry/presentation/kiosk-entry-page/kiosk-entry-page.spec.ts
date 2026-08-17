import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoatsStore } from 'app/boats';
import { ClubStore, ClubTenant } from 'app/club-tenant';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import { DUTY_REGISTER_CLUB_ID, DutiesService } from 'app/duties';
import { RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { RaceCompetitorReader } from 'app/results-input/services/race-competitor-reader';
import { RaceCompetitorMutator } from 'app/results-input/services/race-competitor-mutator';
import { EntryService } from '../../services/entry.service';
import { AuthService } from 'app/auth/auth.service';
import { KioskAuthService } from 'app/auth/services/kiosk-auth.service';
import { KioskEntryPage, DUTY_CHECKIN_RETURN_MS, helmGridLayout } from './kiosk-entry-page';

const clubClasses: BoatClass[] = [
  { id: 'ILCA 7', name: 'ILCA 7', handicaps: [], isSinglehander: true },
  { id: 'RS Aero 7', name: 'RS Aero 7', handicaps: [] },
  { id: '420', name: '420', handicaps: [{ scheme: 'PY', value: 1100 }], isSinglehander: false },
];

const todayRace = {
  id: 'r1',
  seriesId: 's1',
  seriesName: 'Spring',
  index: 1,
  scheduledStart: new Date(),
};

const generalSeries = {
  id: 's1',
  name: 'Spring',
  primaryScoringConfiguration: {
    id: 'cfg-py',
    name: 'PY',
    type: 'Handicap',
    handicapScheme: 'PY',
    fleet: { type: 'GeneralHandicap', id: 'f-general', name: 'General Handicap' },
  },
};
function baseProviders(overrides: Record<string, unknown> = {}) {
  return [
    {
      provide: BoatsStore,
      useValue: {
        boats: () => [
          {
            id: 'b1',
            boatClass: 'ILCA 7',
            sailNumber: '1234',
            helm: 'Alice Smith',
            crew: 'Bob Jones',
            name: '',
            isClub: false,
            tags: [],
          },
          {
            id: 'c1',
            boatClass: '420',
            sailNumber: '99',
            helm: '',
            crew: '',
            name: '',
            isClub: true,
            tags: [],
          },
        ],
        add: vi.fn(),
        ...(overrides['boatsStore'] as object),
      },
    },
    {
      provide: RaceCalendarStore,
      useValue: {
        allRaces: () => [todayRace],
        allSeries: () => [generalSeries],
        ...(overrides['raceCalendar'] as object),
      },
    },
    {
      provide: ClubStore,
      useValue: { club: () => ({ classes: clubClasses, supportedHandicapSchemes: [], tagDefinitions: [] }) },
    },
    {
      provide: ClubTenant,
      useValue: { clubId: (overrides['clubId'] as string) ?? DUTY_REGISTER_CLUB_ID },
    },
    {
      provide: DutiesService,
      useValue: {
        duties: () => [],
        loading: () => false,
        error: () => null,
        reload: vi.fn(),
        setStatus: vi.fn(),
        ...(overrides['dutiesService'] as object),
      },
    },
    {
      provide: CurrentRaces,
      useValue: {
        todaysRaces: () => [todayRace],
        selectedRaces: () => [todayRace],
      },
    },
    {
      provide: EntryService,
      useValue: {
        findEntryConflicts: vi.fn(() => []),
        enterRaces: vi.fn(),
        swapAndEnter: vi.fn(),
      },
    },
    {
      provide: DialogsService,
      useValue: { confirm: vi.fn(), promptEntryConflict: vi.fn() },
    },
    { provide: MatDialog, useValue: { open: vi.fn() } },
    { provide: MatSnackBar, useValue: { open: vi.fn() } },
    {
      provide: RaceCompetitorReader,
      useValue: {
        loading: signal(false),
        selectedResolvedCompetitors: signal([]),
      },
    },
    { provide: RaceCompetitorMutator, useValue: { deleteRaceCompetitor: vi.fn() } },
    {
      provide: KioskAuthService,
      useValue: {
        lastFailure: signal(undefined),
        isFullyKiosk: () => false,
        getDeviceId: () => undefined,
        ensureSignedIn: vi.fn(),
      },
    },
    {
      provide: AuthService,
      useValue: { loggedIn: signal(true) },
    },
  ];
}

function createPage() {
  return TestBed.createComponent(KioskEntryPage).componentInstance;
}

describe('KioskEntryPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [KioskEntryPage],
      providers: baseProviders(),
    });
  });

  it('starts on category step', () => {
    const page = createPage();
    expect(page.view()).toBe('category');
  });

  it('opens entries view from category and back returns to category', () => {
    const page = createPage();
    page.showEntries();
    expect(page.view()).toBe('entries');
    expect(page.stepTitle()).toBe('Entries');
    expect(page.showBack()).toBe(true);
    page.goBack();
    expect(page.view()).toBe('category');
  });

  it('navigates member flow to helm step', () => {
    const page = createPage();
    page.startMember();
    expect(page.view()).toBe('memberHelm');
    expect(page.category()).toBe('member');
  });

  it('filters member helms by letter range', () => {
    const page = createPage();
    page.startMember();
    page.setLetterRange('S-T');
    expect(page.filteredMemberHelms()).toEqual(['Alice Smith']);
    page.setLetterRange('A-B');
    expect(page.filteredMemberHelms()).toEqual([]);
  });

  it('navigates club flow to class step', () => {
    const page = createPage();
    page.startClub();
    expect(page.view()).toBe('clubClass');
    expect(page.clubClasses()).toEqual(['420']);
  });

  it('opens duty check-in from category and back returns to category', () => {
    const page = createPage();
    expect(page.showDutyCheckin()).toBe(true);
    page.showDutyCheckinView();
    expect(page.view()).toBe('dutyCheckin');
    expect(page.stepTitle()).toBe('Duty check-in');
    expect(page.showBack()).toBe(true);
    page.goBack();
    expect(page.view()).toBe('category');
  });

  it('returns to category after idle on duty check-in', () => {
    vi.useFakeTimers();
    const page = createPage();
    page.showDutyCheckinView();
    expect(page.view()).toBe('dutyCheckin');

    vi.advanceTimersByTime(DUTY_CHECKIN_RETURN_MS - 1);
    expect(page.view()).toBe('dutyCheckin');

    vi.advanceTimersByTime(1);
    expect(page.view()).toBe('category');
    vi.useRealTimers();
  });

  it('hides duty check-in for other clubs', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [KioskEntryPage],
      providers: baseProviders({ clubId: 'test' }),
    });
    expect(createPage().showDutyCheckin()).toBe(false);
  });

  it.each(['not-attending', 'attending'] as const)(
    'starts member helm step with surname range after confirm from %s',
    async status => {
      const dialogs = TestBed.inject(DialogsService);
      vi.mocked(dialogs.confirm).mockResolvedValue(true);

      const page = createPage();
      await page.onDutyConfirmed({
        key: 'ack-1',
        name: 'Doug Clow',
        role: 'duty race officer',
        status,
      });

      expect(page.view()).toBe('memberHelm');
      expect(page.category()).toBe('member');
      expect(page.letterRange()).toBe('C-D');
      expect(page.filteredMemberHelms()).toEqual([]);
    },
  );

  it('submits OOD result code after duty confirm', async () => {
    const dialogs = TestBed.inject(DialogsService);
    vi.mocked(dialogs.confirm).mockResolvedValue(true);
    const entry = TestBed.inject(EntryService);
    vi.mocked(entry.enterRaces).mockResolvedValue(undefined);

    const page = createPage();
    await page.onDutyConfirmed({
      key: 'ack-1',
      name: 'Alice Smith',
      role: 'duty race officer',
      status: 'confirmed',
    });
    const boat = TestBed.inject(BoatsStore).boats()[0];
    page.selectMemberHelm('Alice Smith');
    page.selectMemberBoat(boat);
    await page.submit();

    expect(entry.enterRaces).toHaveBeenCalledWith(
      expect.objectContaining({ resultCode: 'OOD', helm: 'Alice Smith' }),
    );
  });

  it('navigates visitor flow to boat details then confirm, without register save', () => {
    const page = createPage();
    page.startVisitor();
    expect(page.view()).toBe('visitorBoat');
    expect(page.category()).toBe('visitor');
    expect(page.stepTitle()).toBe('Visitor boat');

    page.visitorForm.patchValue({
      boatClass: 'ILCA 7',
      sailNumber: '9999',
      helm: 'Pat Visitor',
    });
    page.confirmVisitorBoat();

    expect(page.view()).toBe('memberConfirm');
    expect(page.selectedBoat()?.helm).toBe('Pat Visitor');
    expect(page.selectedBoat()?.sailNumber).toBe('9999');
    expect(page.selectedBoat()?.id.startsWith('new-')).toBe(true);
    expect(page.selectedBoat()?.isClub).toBe(false);

    page.goBack();
    expect(page.view()).toBe('visitorBoat');
  });

  it('passes visitor club through to enterRaces', async () => {
    const entry = TestBed.inject(EntryService);
    vi.mocked(entry.enterRaces).mockResolvedValue(undefined);

    const page = createPage();
    page.startVisitor();
    page.visitorForm.patchValue({
      boatClass: 'ILCA 7',
      sailNumber: '9999',
      helm: 'Pat Visitor',
      club: 'HYC',
    });
    page.confirmVisitorBoat();
    await page.submit();

    expect(entry.enterRaces).toHaveBeenCalledWith(
      expect.objectContaining({ helm: 'Pat Visitor', club: 'HYC' }),
    );
  });

  it('resets to category after start over', () => {
    const page = createPage();
    page.startMember();
    page.selectMemberHelm('Alice Smith');
    page.resetToCategory();
    expect(page.view()).toBe('category');
    expect(page.selectedHelm()).toBeNull();
  });

  it('omits crew for single-hander member boats', () => {
    const page = createPage();
    const boat = TestBed.inject(BoatsStore).boats()[0];

    page.startMember();
    page.selectMemberHelm('Alice Smith');
    page.selectMemberBoat(boat);

    expect(page.isSinglehander()).toBe(true);
    expect(page.memberCrewControl.value).toBe('');
    expect(page.candidateBoat()?.crew).toBeUndefined();
  });

  it('keeps crew for double-handed member boats', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [KioskEntryPage],
      providers: baseProviders({
        boatsStore: {
          boats: () => [
            {
              id: 'b2',
              boatClass: '420',
              sailNumber: '5678',
              helm: 'Carol White',
              crew: 'Dan Green',
              name: '',
              isClub: false,
              tags: [],
            },
          ],
        },
      }),
    });

    const page = createPage();
    const boat = TestBed.inject(BoatsStore).boats()[0];

    page.startMember();
    page.selectMemberHelm('Carol White');
    page.selectMemberBoat(boat);
    page.memberCrewControl.setValue('Dan Green');

    expect(page.isSinglehander()).toBe(false);
    expect(page.candidateBoat()?.crew).toBe('Dan Green');
  });

  it('shows race count for club double-hander with empty crew when helm is set', () => {
    const page = createPage();
    const clubBoat = TestBed.inject(BoatsStore).boats()[1];

    page.startClub();
    page.selectClubClass('420');
    page.selectClubBoat(clubBoat);
    page.clubHelmForm.controls.helm.setValue('Sam Helm');
    page.clubHelmForm.controls.crew.setValue('');

    expect(page.isSinglehander()).toBe(false);
    expect(page.todaysEligibleRaces().length).toBe(1);
    expect(page.raceCountLabel()).toBe('Enter 1 race today.');
    expect(page.canEnter()).toBe(true);
    expect(page.candidateBoat()?.crew).toBeUndefined();
  });

  it('does not claim no races when helm is missing but boat has races today', () => {
    const page = createPage();
    const clubBoat = TestBed.inject(BoatsStore).boats()[1];

    page.startClub();
    page.selectClubClass('420');
    page.selectClubBoat(clubBoat);

    expect(page.todaysEligibleRaces().length).toBe(1);
    expect(page.raceCountLabel()).toContain('Enter 1 race today');
    expect(page.raceCountLabel()).toContain('Enter helm to sign on');
    expect(page.raceCountLabel()).not.toContain('No races today');
    expect(page.canEnter()).toBe(false);
  });
});

describe('helmGridLayout', () => {
  it('uses a single centered column when names fit vertically', () => {
    expect(helmGridLayout(5, 800, 600)).toEqual({ columns: 1, rows: 5 });
  });

  it('adds columns only when rows would overflow the viewport', () => {
    // 600px viewport fits 9 rows at 64px (+ gaps); 10 items need 2 columns.
    expect(helmGridLayout(10, 800, 600)).toEqual({ columns: 2, rows: 5 });
  });

  it('caps columns by available width', () => {
    expect(helmGridLayout(30, 480, 600)).toEqual({ columns: 2, rows: 15 });
  });
});
