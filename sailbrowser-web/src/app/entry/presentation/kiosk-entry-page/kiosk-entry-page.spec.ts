import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoatsStore } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces } from 'app/results-input';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { EntryService } from '../../services/entry.service';
import { KioskEntryPage } from './kiosk-entry-page';

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
                crew: '',
                name: '',
                isClub: false,
                tags: [],
              },
              {
                id: 'c1',
                boatClass: 'RS Aero 7',
                sailNumber: '99',
                helm: '',
                crew: '',
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
          useValue: { club: () => ({ classes: [] }) },
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
    const page = TestBed.createComponent(KioskEntryPage).componentInstance;
    page.startMember();
    page.selectMemberHelm('Alice Smith');
    page.resetToCategory();
    expect(page.view()).toBe('category');
    expect(page.selectedHelm()).toBeNull();
  });
});
