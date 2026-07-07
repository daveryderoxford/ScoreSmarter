import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoatsStore } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import type { BoatClass } from 'app/club-tenant/model/boat-class';
import { RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { EntryService } from '../../services/entry.service';
import { KioskEntryPage, helmGridLayout } from './kiosk-entry-page';

const clubClasses: BoatClass[] = [
  { id: 'ILCA 7', name: 'ILCA 7', handicaps: [], isSinglehander: true },
  { id: 'RS Aero 7', name: 'RS Aero 7', handicaps: [] },
];

function createPage() {
  return TestBed.createComponent(KioskEntryPage).componentInstance;
}

describe('KioskEntryPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [KioskEntryPage],
      providers: [
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
                boatClass: 'RS Aero 7',
                sailNumber: '99',
                helm: '',
                crew: 'Club Crew',
                name: '',
                isClub: true,
                tags: [],
              },
            ],
            add: vi.fn(),
          },
        },
        {
          provide: RaceCalendarStore,
          useValue: {
            allRaces: () => [],
            allSeries: () => [],
          },
        },
        {
          provide: ClubStore,
          useValue: { club: () => ({ classes: clubClasses }) },
        },
        {
          provide: CurrentRaces,
          useValue: { todaysRaces: () => [] },
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
      ],
    });
  });

  it('starts on category step', () => {
    const page = TestBed.createComponent(KioskEntryPage).componentInstance;
    expect(page.view()).toBe('category');
  });

  it('navigates member flow to helm step', () => {
    const page = TestBed.createComponent(KioskEntryPage).componentInstance;
    page.startMember();
    expect(page.view()).toBe('memberHelm');
    expect(page.category()).toBe('member');
  });

  it('filters member helms by letter range', () => {
    const page = TestBed.createComponent(KioskEntryPage).componentInstance;
    page.startMember();
    page.setLetterRange('S-T');
    expect(page.filteredMemberHelms()).toEqual(['Alice Smith']);
    page.setLetterRange('A-B');
    expect(page.filteredMemberHelms()).toEqual([]);
  });

  it('navigates club flow to class step', () => {
    const page = TestBed.createComponent(KioskEntryPage).componentInstance;
    page.startClub();
    expect(page.view()).toBe('clubClass');
    expect(page.clubClasses()).toEqual(['RS Aero 7']);
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
      providers: [
        {
          provide: BoatsStore,
          useValue: {
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
            add: vi.fn(),
          },
        },
        {
          provide: RaceCalendarStore,
          useValue: { allRaces: () => [], allSeries: () => [] },
        },
        {
          provide: ClubStore,
          useValue: {
            club: () => ({
              classes: [{ id: '420', name: '420', handicaps: [], isSinglehander: false }],
            }),
          },
        },
        { provide: CurrentRaces, useValue: { todaysRaces: () => [] } },
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
      ],
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
