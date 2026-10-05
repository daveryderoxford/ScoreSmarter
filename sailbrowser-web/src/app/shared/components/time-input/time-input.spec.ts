import { Component, input, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TimeInput } from './time-input';

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
    return { fixture, input, control: fixture.componentInstance.control };
  }

  it('renders numeric inputmode for clock times', () => {
    const { input } = render('hms');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('pattern')).toBe('[0-9]*');
  });

  it('renders a decimal keypad for elapsed times so minus is available without a full keyboard', () => {
    const { input } = render('mss');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('pattern')).toBe('-?[0-9]*');
  });

  it('writeValue displays hms', () => {
    const { fixture, input } = render();
    fixture.componentInstance.control.setValue(14 * 3600 + 32 * 60 + 5);
    fixture.detectChanges();
    expect(input.value).toBe('14:32:05');
  });

  it('writeValue displays mss', () => {
    const { fixture, input } = render('mss');
    fixture.componentInstance.control.setValue(123 * 60 + 45);
    fixture.detectChanges();
    expect(input.value).toBe('123:45');
  });

  it('writeValue displays negative mss with a leading minus', () => {
    const { fixture, input } = render('mss');
    fixture.componentInstance.control.setValue(-90);
    fixture.detectChanges();
    expect(input.value).toBe('-1:30');
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
});
