import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { RaceDayDutyMember } from '@shared/race-day';
import { EntryDialog, type EntryDialogResult } from 'app/entry/presentation/entry-dialog/entry-dialog';
import type { Race } from 'app/race-calendar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { HomeDutiesSection } from './home-duties-section';

describe('HomeDutiesSection', () => {
  const member = { name: 'Alice Smith' } as RaceDayDutyMember;

  function render(options: { confirm: boolean; result?: EntryDialogResult }) {
    const open = vi.fn(() => ({ afterClosed: () => of(options.result) }));
    const snackbarOpen = vi.fn();
    TestBed.configureTestingModule({
      imports: [HomeDutiesSection],
      providers: [
        { provide: DialogsService, useValue: { confirm: async () => options.confirm } },
        { provide: MatDialog, useValue: { open } },
        { provide: MatSnackBar, useValue: { open: snackbarOpen } },
        { provide: AppBreakpoints, useValue: { isMobile: signal(false) } },
      ],
    });
    TestBed.overrideComponent(HomeDutiesSection, { set: { imports: [], template: '' } });
    const component = TestBed.createComponent(HomeDutiesSection).componentInstance;
    return { component, open, snackbarOpen };
  }

  it('does nothing when the member declines to enter as OOD', async () => {
    const { component, open } = render({ confirm: false });
    await component.onDutyConfirmed(member);
    expect(open).not.toHaveBeenCalled();
  });

  it('opens the entry dialog for the duty member and confirms the entered races', async () => {
    const races = [{ id: 'r1' }, { id: 'r2' }] as Race[];
    const { component, open, snackbarOpen } = render({ confirm: true, result: { races } });

    await component.onDutyConfirmed(member);

    expect(open).toHaveBeenCalledWith(EntryDialog, expect.objectContaining({ data: { oodHelm: 'Alice Smith' } }));
    expect(snackbarOpen).toHaveBeenCalledWith('Entered 2 races as OOD.', 'Dismiss', { duration: 3000 });
  });

  it('shows no confirmation when the entry dialog is closed without entering', async () => {
    const { component, snackbarOpen } = render({ confirm: true });
    await component.onDutyConfirmed(member);
    expect(snackbarOpen).not.toHaveBeenCalled();
  });
});
