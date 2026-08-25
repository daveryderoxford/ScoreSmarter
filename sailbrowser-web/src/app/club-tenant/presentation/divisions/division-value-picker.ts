import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import type { Division } from 'app/race-calender/model/division';
import { readableForegroundFor } from './division-chip-style';

/**
 * Multi-select chip picker over a series `Division[]` catalog.
 */
@Component({
  selector: 'app-division-value-picker',
  imports: [MatChipsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DivisionValuePicker),
      multi: true,
    },
  ],
  template: `
    @if (visibleDivisions().length === 0) {
      <span class="empty" data-testid="no-divisions-available">
        {{ emptyText() }}
      </span>
    } @else {
      <mat-chip-listbox
        multiple
        [disabled]="disabled()"
        (change)="onSelectionChange($event)">
        @for (div of visibleDivisions(); track div.id) {
          <mat-chip-option
            [value]="div.id"
            [selected]="isSelected(div.id)"
            [disabled]="isDisabled(div.id)"
            [style.background-color]="chipBackground(div)"
            [style.border-color]="chipBackground(div)"
            [style.color]="chipForeground(div)">
            {{ div.name }}
          </mat-chip-option>
        }
      </mat-chip-listbox>
    }
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
      font-style: italic;
    }
  `],
})
export class DivisionValuePicker implements ControlValueAccessor {
  readonly availableDivisions = input<readonly Division[]>([]);
  readonly disabledIds = input<readonly string[]>([]);
  readonly emptyText = input<string>('No divisions configured.');

  private readonly _value = signal<string[]>([]);
  protected readonly disabled = signal(false);

  protected readonly visibleDivisions = computed(() =>
    this.availableDivisions().filter(d => d.name.trim().length > 0),
  );

  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string[] | null | undefined): void {
    this._value.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected isSelected(id: string): boolean {
    return this._value().includes(id);
  }

  protected isDisabled(id: string): boolean {
    if (this.disabled()) return true;
    return this.disabledIds().includes(id);
  }

  protected chipBackground(div: Division): string | null {
    if (!this.isSelected(div.id) || div.display.style !== 'marker' || !div.display.markerColor) {
      return null;
    }
    return div.display.markerColor;
  }

  protected chipForeground(div: Division): string | null {
    const bg = this.chipBackground(div);
    return bg ? readableForegroundFor(bg) : null;
  }

  protected onSelectionChange(event: MatChipListboxChange): void {
    const next: string[] = Array.isArray(event.value)
      ? [...event.value as string[]]
      : event.value
        ? [event.value as string]
        : [];

    const preserved = this._value().filter(
      id => !this.visibleDivisions().some(d => d.id === id),
    );
    const merged = [...new Set([...preserved, ...next])];
    this._value.set(merged);
    this.onChange(merged);
    this.onTouched();
  }
}
