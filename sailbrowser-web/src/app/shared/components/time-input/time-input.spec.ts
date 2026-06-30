import { Component, input, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TimeInput } from './time-input';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, TimeInput],
  template: `
    <app-time-input
      [formControl]="control"
      [format]="format()"
    />
  `,
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

  it('renders numeric inputmode', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('type')).toBe('text');
  });

  it('writeValue displays hms', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.control.setValue(14 * 3600 + 32 * 60 + 5);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('14:32:05');
  });

  it('writeValue displays mss', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentRef.setInput('format', 'mss');
    fixture.componentInstance.control.setValue(123 * 60 + 45);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('123:45');
  });

  it('writeValue displays negative mss with a leading minus', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentRef.setInput('format', 'mss');
    fixture.componentInstance.control.setValue(-90);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('-1:30');
  });

  it('disables inner input when parent control disabled', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
