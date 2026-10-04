import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { NumberField } from './number-field';
import type { NumberFieldMode } from './number-field-value';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, NumberField],
  template: `<input [formControl]="control" [appNumberField]="mode()" />`,
})
class HostComponent {
  readonly mode = input<NumberFieldMode>('integer');
  readonly control = new FormControl<string | number | null>('');
}

describe('NumberField', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  function render(mode: NumberFieldMode = 'integer') {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    return { fixture, input, control: fixture.componentInstance.control };
  }

  it('sets type, inputmode, and pattern for integer mode', () => {
    const { input } = render('integer');
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('pattern')).toBe('[0-9]*');
  });

  it('sets a decimal keyboard for signed latitude-style values', () => {
    const { input } = render('signedDecimal');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('pattern')).toBe('-?[0-9]*[.]?[0-9]*');
  });

  it('blocks letters on keydown', () => {
    const { input } = render();
    input.value = '12';
    input.setSelectionRange(2, 2);
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    expect(input.dispatchEvent(event)).toBe(false);
    expect(input.value).toBe('12');
  });

  it('allows digits on keydown', () => {
    const { input } = render();
    input.value = '1';
    input.setSelectionRange(1, 1);
    const event = new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true });
    expect(input.dispatchEvent(event)).toBe(true);
  });

  it('blocks a second decimal point', () => {
    const { input } = render('decimal');
    input.value = '1.2';
    input.setSelectionRange(3, 3);
    const event = new KeyboardEvent('keydown', { key: '.', bubbles: true, cancelable: true });
    expect(input.dispatchEvent(event)).toBe(false);
  });

  it('allows a leading minus only in signedDecimal', () => {
    const integer = render('integer');
    integer.input.setSelectionRange(0, 0);
    expect(
      integer.input.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true, cancelable: true })),
    ).toBe(false);

    const signed = render('signedDecimal');
    signed.input.setSelectionRange(0, 0);
    expect(
      signed.input.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true, cancelable: true })),
    ).toBe(true);
  });

  it('rewrites a comma to a decimal point', () => {
    const { input, control } = render('decimal');
    input.value = '12';
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true, cancelable: true }));
    expect(input.value).toBe('12.');
    expect(control.value).toBe('12.');
  });

  it('sanitizes pasted text and updates the form control', () => {
    const { input, control } = render('signedDecimal');
    input.value = '';
    input.setSelectionRange(0, 0);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => 'lat -51.50N extra' },
    });
    input.dispatchEvent(event);
    expect(input.value).toBe('-51.50');
    expect(control.value).toBe('-51.50');
  });

  it('sanitizes values that arrive via the input event', () => {
    const { input, control } = render('integer');
    input.value = '4x2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('42');
    expect(control.value).toBe('42');
  });
});
