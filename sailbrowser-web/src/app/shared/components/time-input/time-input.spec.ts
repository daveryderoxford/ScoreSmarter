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
      [anchorDate]="anchorDate()"
    />
  `,
})
class HostComponent implements OnInit {
  readonly format = input<'hms' | 'mss'>('hms');
  readonly anchorDate = input(new Date(2026, 5, 15, 0, 0, 0));
  readonly control = new FormControl<Date | null>(null);

  ngOnInit(): void {
    const v = this.initial();
    if (v) this.control.setValue(v);
  }

  readonly initial = input<Date | null>(null);
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
    fixture.componentInstance.control.setValue(new Date(2026, 5, 15, 14, 32, 5));
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('14:32:05');
  });

  it('writeValue displays mss', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentRef.setInput('format', 'mss');
    const anchor = new Date(2026, 5, 15);
    fixture.componentRef.setInput('anchorDate', anchor);
    const elapsed = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 0, 123, 45);
    fixture.componentInstance.control.setValue(elapsed);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('123.45');
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
