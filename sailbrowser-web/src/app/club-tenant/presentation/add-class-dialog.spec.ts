import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from 'app/auth/auth.service';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ADD_CLASS_OPTION, AddClassLauncher } from './add-class-dialog';

function launcher(added: { name: string } | undefined) {
  const open = vi.fn(() => ({ afterClosed: () => of(added) }));
  TestBed.configureTestingModule({
    providers: [
      { provide: MatDialog, useValue: { open } },
      { provide: AuthService, useValue: { canAddClubClass: signal(true) } },
    ],
  });
  return { launcher: TestBed.inject(AddClassLauncher), open };
}

describe('AddClassLauncher', () => {
  it('restores the previous class, then selects the added class', async () => {
    const { launcher: l, open } = launcher({ name: 'RS Aero 5' });
    const control = new FormControl('Solo', { nonNullable: true });
    l.attach(control, () => 'Aero 5');

    control.setValue(ADD_CLASS_OPTION);
    expect(control.value).toBe('Solo');
    await vi.waitFor(() => expect(control.value).toBe('RS Aero 5'));
    expect(open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: { initialName: 'Aero 5' } }));
  });

  it('keeps the previous class when the dialog is cancelled', async () => {
    const { launcher: l, open } = launcher(undefined);
    const control = new FormControl('Solo', { nonNullable: true });
    l.attach(control);

    control.setValue('ILCA 7');
    control.setValue(ADD_CLASS_OPTION);
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    expect(control.value).toBe('ILCA 7');
  });
});
