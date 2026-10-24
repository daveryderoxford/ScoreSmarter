import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RaceTimeInput } from './race-time-input';

const day = new Date(2026, 5, 10, 10, 0, 0);
const finish = new Date(2026, 5, 10, 14, 32, 5, 400);

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RaceTimeInput],
  template: `
    <form [formGroup]="form">
      <app-race-time-input
        formControlName="finishTime"
        [mode]="'tod'"
        [baseTime]="base"
        [scheduledStart]="base"
      />
    </form>
  `,
})
class HostComponent {
  readonly base = day;
  readonly form = new FormGroup({
    finishTime: new FormControl<Date | null>(finish),
  });
}

describe('RaceTimeInput', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('focusing then leaving an unchanged time does not dirty the parent control', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const control = fixture.componentInstance.form.controls.finishTime;

    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(control.dirty).toBe(false);
    expect(control.value).toBe(finish);
  });
});
