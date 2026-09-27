import { Component, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClubStore } from 'app/club-tenant';
import type { Fleet } from 'app/club-tenant/model/fleet';
import { FleetForm } from './fleet-form';

const fleetA: Fleet = {
  type: 'HandicapRange',
  id: 'fa',
  name: 'Fast',
  scheme: 'PY',
  min: 700,
  max: 999,
};

const fleetB: Fleet = {
  type: 'HandicapRange',
  id: 'fb',
  name: 'Slow',
  scheme: 'PY',
  min: 1000,
  max: 1400,
};

@Component({
  standalone: true,
  imports: [FleetForm],
  template: `<app-fleet-form [fleet]="fleet()" />`,
})
class HostComponent {
  readonly fleet = signal<Fleet | undefined>(fleetA);
}

describe('FleetForm discard and rebind', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        {
          provide: ClubStore,
          useValue: {
            club: signal({
              classes: [],
              supportedHandicapSchemes: ['PY'],
            }),
          },
        },
      ],
    }).overrideComponent(FleetForm, {
      set: {
        template: '<form [formGroup]="form"></form>',
        imports: [ReactiveFormsModule],
      },
    });
  });

  function formOf(fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>): FleetForm {
    return fixture.debugElement.children[0].componentInstance as FleetForm;
  }

  it('clears dirty leftover edits when discardChanges is called', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const form = formOf(fixture);

    form.form.controls.name.setValue('Edited');
    form.form.markAsDirty();
    expect(form.canDeactivate()).toBe(false);

    form.discardChanges();

    expect(form.form.controls.name.value).toBe('Fast');
    expect(form.form.dirty).toBe(false);
    expect(form.canDeactivate()).toBe(true);
  });

  it('replaces leftover fields when the bound fleet id changes', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const form = formOf(fixture);

    form.form.controls.name.setValue('Edited leftover');
    form.form.controls.min.setValue(1);
    form.form.markAsDirty();
    expect(form.canDeactivate()).toBe(false);

    fixture.componentInstance.fleet.set(fleetB);
    fixture.detectChanges();

    expect(form.form.controls.name.value).toBe('Slow');
    expect(form.form.controls.min.value).toBe(1000);
    expect(form.form.controls.max.value).toBe(1400);
    expect(form.form.dirty).toBe(false);
    expect(form.canDeactivate()).toBe(true);
  });
});
