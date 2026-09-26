import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Boat } from 'app/boats';
import { BoatsStore } from 'app/boats/services/boats.store';
import { ClubStore } from 'app/club-tenant';
import { BoatForm } from './boat-form';

const boatA: Boat = {
  id: 'a',
  boatClass: 'ILCA 7',
  sailNumber: '111',
  helm: 'Alice',
  crew: 'Ann',
  name: 'Lightning',
  isClub: false,
};

const boatB: Boat = {
  id: 'b',
  boatClass: 'RS Aero',
  sailNumber: '222',
  helm: 'Bob',
  crew: '',
  name: 'Breeze',
  isClub: false,
};

@Component({
  standalone: true,
  imports: [BoatForm],
  template: `<app-boat-form [boat]="boat()" />`,
})
class HostComponent {
  readonly boat = signal<Boat | undefined>(boatA);
}

describe('BoatForm discard and rebind', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideNoopAnimations(),
        {
          provide: ClubStore,
          useValue: {
            club: signal({
              classes: [
                { id: 'ILCA 7', name: 'ILCA 7', handicaps: [], isSinglehander: true },
                { id: 'RS Aero', name: 'RS Aero', handicaps: [], isSinglehander: true },
              ],
              supportedHandicapSchemes: [],
            }),
          },
        },
        {
          provide: BoatsStore,
          useValue: {
            boats: signal([boatA, boatB]),
            uniqueHelmNames: signal(['Alice', 'Bob']),
          },
        },
      ],
    });
  });

  function formOf(fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>): BoatForm {
    return fixture.debugElement.children[0].componentInstance as BoatForm;
  }

  it('clears dirty leftover edits when discardChanges is called', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const form = formOf(fixture);

    form.form.controls['helm'].setValue('Edited');
    expect(form.canDeactivate()).toBe(false);

    form.discardChanges();

    expect(form.form.controls['helm'].value).toBe('Alice');
    expect(form.canDeactivate()).toBe(true);
  });

  it('replaces leftover fields when the bound boat id changes', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const form = formOf(fixture);

    form.form.controls['helm'].setValue('Edited');
    form.form.controls['name'].setValue('Kept leftover');
    expect(form.canDeactivate()).toBe(false);

    fixture.componentInstance.boat.set(boatB);
    fixture.detectChanges();

    expect(form.form.controls['helm'].value).toBe('Bob');
    expect(form.form.controls['name'].value).toBe('Breeze');
    expect(form.form.controls['sailNumber'].value).toBe('222');
    expect(form.canDeactivate()).toBe(true);
  });
});
