import { signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClubStore } from 'app/club-tenant';
import type { Fleet } from 'app/club-tenant/model/fleet';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { FleetEdit } from './fleet-edit';
import { FleetForm } from './fleet-form/fleet-form';

const fleetA: Fleet = {
  id: 'fleet-a',
  type: 'HandicapRange',
  name: 'Slow handicap',
  min: 1100,
  max: 1400,
  scheme: 'PY',
};

const fleetB: Fleet = {
  id: 'fleet-b',
  type: 'BoatClass',
  boatClassId: 'ILCA 7',
};

describe('FleetEdit form reuse', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FleetEdit],
      providers: [
        {
          provide: ClubStore,
          useValue: {
            club: signal({
              supportedHandicapSchemes: ['PY'],
              classes: [],
              fleets: [fleetA, fleetB],
            }),
          },
        },
        { provide: Router, useValue: { navigate: () => undefined } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AppBreakpoints, useValue: { isWideLayout: signal(true) } },
      ],
    }).overrideComponent(FleetForm, {
      set: {
        template: '<form [formGroup]="form"></form>',
        imports: [ReactiveFormsModule],
      },
    });
  });

  it('recreates a pristine form with the new fleet when the route id changes', () => {
    const fixture = TestBed.createComponent(FleetEdit);
    fixture.componentRef.setInput('id', fleetA.id);
    fixture.detectChanges();

    const firstForm = fixture.componentInstance.form();
    expect(firstForm).toBeTruthy();
    firstForm!.form.controls.name.setValue('Changed');
    expect(firstForm!.form.dirty).toBe(true);

    firstForm!.discardChanges();
    expect(firstForm!.canDeactivate()).toBe(true);

    fixture.componentRef.setInput('id', fleetB.id);
    fixture.detectChanges();

    const secondForm = fixture.componentInstance.form();
    expect(secondForm).toBeTruthy();
    expect(secondForm).not.toBe(firstForm);
    expect(secondForm!.form.dirty).toBe(false);
    expect(secondForm!.form.controls.type.value).toBe('BoatClass');
    expect(secondForm!.form.controls.boatClassId.value).toBe('ILCA 7');
    expect(secondForm!.canDeactivate()).toBe(true);
  });
});
