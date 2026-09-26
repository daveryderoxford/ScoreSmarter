import { signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClubStore } from 'app/club-tenant';
import type { Boat } from 'app/boats';
import { BoatsStore } from 'app/boats';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { BoatEdit } from './boat-edit';
import { BoatForm } from './boat-form/boat-form';
import { DuplicateBoatCheck } from './duplicate-boat-check/duplicate-check-service';

const boatA: Boat = {
  id: 'boat-a',
  boatClass: 'ILCA 7',
  sailNumber: '111',
  helm: 'Alice',
  crew: 'Pat',
  name: 'Lightning',
  isClub: false,
};

const boatB: Boat = {
  id: 'boat-b',
  boatClass: 'RS Aero',
  sailNumber: '222',
  helm: 'Bob',
  crew: '',
  name: 'Breeze',
  isClub: false,
};

describe('BoatEdit form reuse', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BoatEdit],
      providers: [
        { provide: BoatsStore, useValue: { boats: signal([boatA, boatB]) } },
        { provide: Router, useValue: { navigate: () => undefined } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: DuplicateBoatCheck, useValue: { duplicateCheck: async () => true } },
        {
          provide: ClubStore,
          useValue: { club: signal({ supportedHandicapSchemes: [], classes: [] }) },
        },
        { provide: AppBreakpoints, useValue: { isWideLayout: signal(true) } },
      ],
    }).overrideComponent(BoatForm, {
      set: {
        template: '<form [formGroup]="form"></form>',
        imports: [ReactiveFormsModule],
      },
    });
  });

  it('recreates a pristine form with the new boat when the route id changes', () => {
    const fixture = TestBed.createComponent(BoatEdit);
    fixture.componentRef.setInput('id', boatA.id);
    fixture.detectChanges();

    const firstForm = fixture.componentInstance.form();
    firstForm.form.controls['helm'].setValue('Changed');
    firstForm.form.markAsDirty();
    expect(firstForm.form.dirty).toBe(true);

    firstForm.discardChanges();
    expect(firstForm.canDeactivate()).toBe(true);

    fixture.componentRef.setInput('id', boatB.id);
    fixture.detectChanges();

    const secondForm = fixture.componentInstance.form();
    expect(secondForm).not.toBe(firstForm);
    expect(secondForm.form.dirty).toBe(false);
    expect(secondForm.form.controls['helm'].value).toBe('Bob');
    expect(secondForm.form.controls['sailNumber'].value).toBe('222');
    expect(secondForm.canDeactivate()).toBe(true);
  });
});
