import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoatsStore } from 'app/boats/services/boats.store';
import { ClubStore } from 'app/club-tenant';
import { AddClassLauncher } from 'app/club-tenant/presentation/add-class-dialog';
import { ScanRowEditDialog, ScanRowEditDialogData, ScanRowLookup } from './scan-row-edit-dialog';

const lookups: Record<string, ScanRowLookup> = {
  '1234': { enteredAs: 'Alex', candidates: [] },
  '5555': { candidates: [{ helm: 'Casey', source: 'series-entry' }] },
  '6666': { candidates: [{ helm: 'Drew', source: 'boat' }, { helm: 'Eli', source: 'boat' }] },
};

describe('ScanRowEditDialog', () => {
  let close: ReturnType<typeof vi.fn>;

  function render(data: Partial<ScanRowEditDialogData> = {}) {
    TestBed.configureTestingModule({
      imports: [ScanRowEditDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            rowIndex: 4,
            classes: ['ILCA 7', 'Solo'],
            lookup: (_boatClass: string, sailNumber: string) => lookups[sailNumber] ?? { candidates: [] },
            ...data,
          } satisfies ScanRowEditDialogData,
        },
        { provide: MatDialogRef, useValue: { close } },
        { provide: ClubStore, useValue: { club: signal({ classes: [{ name: 'Solo', isSinglehander: true }] }) } },
        { provide: BoatsStore, useValue: { uniqueHelmNames: signal(['Zoe', 'Casey']) } },
        { provide: AddClassLauncher, useValue: { canAdd: signal(false), attachUntilDestroyed: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(ScanRowEditDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance as unknown as {
      form: { patchValue(v: object): void; controls: Record<string, { value: string }> };
      helmSuggestions(): string[];
      canSave(): boolean;
      save(): void;
    };
    const set = (value: object) => {
      dialog.form.patchValue(value);
      fixture.detectChanges();
    };
    const status = () => (fixture.nativeElement.querySelector('.status') as HTMLElement | null)?.textContent?.trim();
    return { fixture, dialog, set, status };
  }

  beforeEach(() => {
    close = vi.fn();
  });

  it('pre-fills the row values', () => {
    const { dialog } = render({ boatClass: 'ILCA 7', sailNumber: '7777', helm: 'Bob' });
    expect(dialog.form.controls['boatClass']!.value).toBe('ILCA 7');
    expect(dialog.form.controls['sailNumber']!.value).toBe('7777');
    expect(dialog.form.controls['helm']!.value).toBe('Bob');
  });

  it('describes what exists for the class and sail number', () => {
    const { set, status } = render({ boatClass: 'ILCA 7' });

    set({ sailNumber: '1234' });
    expect(status()).toContain('Entered in this race as Alex');

    set({ sailNumber: '5555' });
    expect(status()).toBe('Series entry: Casey');

    set({ sailNumber: '6666' });
    expect(status()).toBe('2 helms sail this boat: Drew, Eli');

    set({ sailNumber: '7777' });
    expect(status()).toContain('No entry found');
  });

  it('suggests the boat helms before other helm names', () => {
    const { dialog, set } = render({ boatClass: 'ILCA 7' });
    set({ sailNumber: '6666', helm: '' });
    expect(dialog.helmSuggestions()).toEqual(['Drew', 'Eli', 'Zoe', 'Casey']);
  });

  it('needs a helm unless the boat is already entered', () => {
    const { dialog, set } = render({ boatClass: 'ILCA 7' });
    set({ sailNumber: '7777', helm: '' });
    expect(dialog.canSave()).toBe(false);

    set({ sailNumber: '1234' });
    expect(dialog.canSave()).toBe(true);
  });

  it('returns the typed values', () => {
    const { dialog, set } = render({ boatClass: 'ILCA 7' });
    set({ sailNumber: ' 7777 ', helm: ' Bob ', crew: 'Fran' });

    dialog.save();

    expect(close).toHaveBeenCalledWith({ boatClass: 'ILCA 7', sailNumber: '7777', helm: 'Bob', crew: 'Fran' });
  });

  it('returns the entered helm when the boat is already in the race', () => {
    const { dialog, set } = render({ boatClass: 'ILCA 7' });
    set({ sailNumber: '1234', helm: 'Someone' });

    dialog.save();

    expect(close).toHaveBeenCalledWith({ boatClass: 'ILCA 7', sailNumber: '1234', helm: 'Alex' });
  });

  it('drops the crew for a singlehander', () => {
    const { dialog, set } = render({ boatClass: 'Solo' });
    set({ sailNumber: '7777', helm: 'Bob', crew: 'Fran' });

    dialog.save();

    expect(close).toHaveBeenCalledWith({ boatClass: 'Solo', sailNumber: '7777', helm: 'Bob' });
  });
});
