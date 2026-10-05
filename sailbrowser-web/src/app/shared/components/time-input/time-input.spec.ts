import { Component, input, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { TimeInput } from './time-input';
import { TimeSignToggle } from './time-sign-toggle';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, TimeInput],
  template: `<input [formControl]="control" [appTimeInput]="format()" />`,
})
class HostComponent implements OnInit {
  readonly format = input<'hms' | 'mss'>('hms');
  readonly control = new FormControl<number | null>(null);

  ngOnInit(): void {
    const v = this.initial();
    if (v != null) this.control.setValue(v);
  }

  readonly initial = input<number | null>(null);
}

describe('TimeInput', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  function render(format: 'hms' | 'mss' = 'hms') {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentRef.setInput('format', format);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const time = fixture.debugElement.query(By.directive(TimeInput)).injector.get(TimeInput);
    return { fixture, input, control: fixture.componentInstance.control, time };
  }

  it('renders numeric inputmode for clock times', () => {
    const { input } = render('hms');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('pattern')).toBe('[0-9]*');
  });

  it('renders a decimal keypad for elapsed times; sign is the plus/minus control', () => {
    const { input } = render('mss');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('pattern')).toBe('[0-9]*');
  });

  it('writeValue displays hms', () => {
    const { fixture, input } = render();
    fixture.componentInstance.control.setValue(14 * 3600 + 32 * 60 + 5);
    fixture.detectChanges();
    expect(input.value).toBe('14:32:05');
  });

  it('writeValue displays unsigned mss and defaults the sign to plus', () => {
    const { fixture, input, time } = render('mss');
    fixture.componentInstance.control.setValue(123 * 60 + 45);
    fixture.detectChanges();
    expect(input.value).toBe('123:45');
    expect(time.negative()).toBe(false);
  });

  it('writeValue of a negative elapsed value shows plus/minus as minus and omits the dash in the field', () => {
    const { fixture, input, time, control } = render('mss');
    fixture.componentInstance.control.setValue(-90);
    fixture.detectChanges();
    expect(input.value).toBe('1:30');
    expect(time.negative()).toBe(true);
    expect(control.value).toBe(-90);
  });

  it('toggleSign on an empty elapsed field is minus without inserting text', () => {
    const { time, input, control } = render('mss');
    expect(time.negative()).toBe(false);
    time.toggleSign();
    expect(time.negative()).toBe(true);
    expect(input.value).toBe('');
    expect(control.value).toBe(null);
  });

  it('toggleSign negates a complete elapsed value', () => {
    const { fixture, time, input, control } = render('mss');
    fixture.componentInstance.control.setValue(90);
    fixture.detectChanges();
    time.toggleSign();
    expect(time.negative()).toBe(true);
    expect(input.value).toBe('1:30');
    expect(control.value).toBe(-90);
  });

  it('disables the host input when the parent control is disabled', () => {
    const { fixture, input } = render();
    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
  });

  it('blocks letters on keydown', () => {
    const { input } = render();
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    expect(input.dispatchEvent(event)).toBe(false);
    expect(input.value).toBe('');
  });

  it('blocks letters on elapsed fields as well', () => {
    const { input } = render('mss');
    expect(input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }))).toBe(
      false,
    );
    expect(input.value).toBe('');
  });

  it('toggles elapsed sign from a keyboard minus without inserting a dash', () => {
    const { fixture, input, time, control } = render('mss');
    fixture.componentInstance.control.setValue(90);
    fixture.detectChanges();
    expect(
      input.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true, cancelable: true })),
    ).toBe(false);
    expect(input.value).toBe('1:30');
    expect(time.negative()).toBe(true);
    expect(control.value).toBe(-90);
  });

  it('does not toggle sign on clock times', () => {
    const { time, input } = render('hms');
    time.toggleSign();
    expect(time.negative()).toBe(false);
    expect(input.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true, cancelable: true }))).toBe(
      false,
    );
    expect(time.negative()).toBe(false);
  });

  it('resets empty elapsed fields to plus on blur', () => {
    const { time, input } = render('mss');
    time.toggleSign();
    expect(time.negative()).toBe(true);
    input.dispatchEvent(new Event('blur'));
    expect(time.negative()).toBe(false);
  });
});

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, TimeInput, TimeSignToggle],
  template: `
    <input #t="appTimeInput" [formControl]="control" appTimeInput="mss" />
    <app-time-sign-toggle [timeInput]="t" />
  `,
})
class SignToggleHostComponent {
  readonly control = new FormControl<number | null>(null);
}

describe('TimeSignToggle', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SignToggleHostComponent] });
  });

  function renderToggle() {
    const fixture = TestBed.createComponent(SignToggleHostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const time = fixture.debugElement.query(By.directive(TimeInput)).injector.get(TimeInput);
    return { fixture, button, time, control: fixture.componentInstance.control };
  }

  it('defaults to plus', () => {
    const { button, time } = renderToggle();
    expect(time.negative()).toBe(false);
    expect(button.textContent?.replace(/\s/g, '')).toBe('+');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the control flips to minus and back', () => {
    const { fixture, button, time, control } = renderToggle();
    control.setValue(90);
    fixture.detectChanges();
    button.click();
    fixture.detectChanges();
    expect(time.negative()).toBe(true);
    expect(button.textContent?.replace(/\s/g, '')).toBe('−');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(control.value).toBe(-90);
    button.click();
    fixture.detectChanges();
    expect(time.negative()).toBe(false);
    expect(button.textContent?.replace(/\s/g, '')).toBe('+');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(control.value).toBe(90);
  });
});
