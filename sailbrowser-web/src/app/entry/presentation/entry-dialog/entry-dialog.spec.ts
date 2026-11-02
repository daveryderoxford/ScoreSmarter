import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import type { Race } from 'app/race-calender';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EntryWizard } from '../entry-wizard/entry-wizard';
import { FakeEntryWizard } from '../entry-wizard/entry-wizard.testing';
import { EntryDialog, type EntryDialogData } from './entry-dialog';

describe('EntryDialog', () => {
  function render(data: EntryDialogData, confirmResult = true) {
    const close = vi.fn();
    const confirm = vi.fn(async () => confirmResult);
    const backdropClick = new Subject<MouseEvent>();
    const keydownEvents = new Subject<KeyboardEvent>();
    TestBed.configureTestingModule({
      imports: [EntryDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        {
          provide: MatDialogRef,
          useValue: { close, backdropClick: () => backdropClick, keydownEvents: () => keydownEvents },
        },
        { provide: DialogsService, useValue: { confirm } },
      ],
    });
    TestBed.overrideComponent(EntryDialog, {
      remove: { imports: [EntryWizard] },
      add: { imports: [FakeEntryWizard] },
    });
    const fixture = TestBed.createComponent(EntryDialog);
    fixture.detectChanges();
    const wizard = fixture.debugElement.query(By.directive(FakeEntryWizard)).componentInstance as FakeEntryWizard;
    return { fixture, wizard, close, confirm, backdropClick, keydownEvents };
  }

  function title(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.querySelector('h2')?.textContent?.trim() ?? '';
  }

  it('passes the race and search text to the wizard under an "Add entry" title', () => {
    const { fixture, wizard } = render({ raceId: 'r1', initialSearch: '1234' });
    expect(title(fixture)).toBe('Add entry');
    expect(wizard.scopedRaceId()).toBe('r1');
    expect(wizard.initialSearch()).toBe('1234');
    expect(wizard.oodHelm()).toBeUndefined();
  });

  it('uses the OOD title and passes the duty member to the wizard', () => {
    const { fixture, wizard } = render({ oodHelm: 'Alice Smith' });
    expect(title(fixture)).toBe('Enter as OOD');
    expect(wizard.oodHelm()).toBe('Alice Smith');
  });

  it('closes with the entered races', () => {
    const { wizard, close } = render({ raceId: 'r1' });
    const races = [{ id: 'r1' } as Race];
    wizard.entered.emit({ races });
    expect(close).toHaveBeenCalledWith({ races });
  });

  it('closes without asking when nothing has been entered', async () => {
    const { fixture, close, confirm } = render({});
    await fixture.componentInstance.requestClose();
    expect(confirm).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith();
  });

  it('keeps the dialog open when the user chooses to keep editing', async () => {
    const { fixture, wizard, close, confirm } = render({}, false);
    wizard.dirty.set(true);
    await fixture.componentInstance.requestClose();
    expect(confirm).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('asks before discarding on Escape or a backdrop click', async () => {
    const { wizard, close, confirm, backdropClick, keydownEvents } = render({}, true);
    wizard.dirty.set(true);

    keydownEvents.next(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));

    backdropClick.next(new MouseEvent('click'));
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(2));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
