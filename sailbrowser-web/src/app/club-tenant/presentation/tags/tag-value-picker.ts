import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { ClubTagDefinition } from '../../model/club-tag';
import { tagChipStyle } from './tag-chip-style';

/**
 * Multi-select chip picker over a `ClubTagDefinition[]` catalog. Emits a
 * `string[]` of selected tag ids via `ControlValueAccessor` so it can be
 * dropped into either reactive or template-driven forms:
 *
 * ```html
 * <app-tag-value-picker
 *   [availableTags]="club.tagDefinitions"
 *   formControlName="tags" />
 * ```
 *
 * The picker is intentionally catalog-agnostic - it knows nothing about
 * `ClubStore`, `Boat`, or `SeriesEntry`. Callers wire it to whichever
 * source provides the current `ClubTagDefinition[]` snapshot (live club
 * data, a frozen published-results snapshot, a Storybook fixture, ...).
 *
 * Definitions with a blank `label` are filtered out (blank-label is the
 * club-admin convention for "hide this definition without deleting it").
 */
@Component({
  selector: 'app-tag-value-picker',
  standalone: true,
  imports: [MatChipsModule, NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TagValuePicker),
      multi: true,
    },
  ],
  template: `
    @if (visibleTags().length === 0) {
      <span class="empty" data-testid="no-tags-available">
        {{ emptyText() }}
      </span>
    } @else {
      <mat-chip-listbox
        multiple
        [disabled]="disabled()"
        (change)="onSelectionChange($event)">
        @for (tag of visibleTags(); track tag.id) {
          <mat-chip-option
            [value]="tag.id"
            [selected]="isSelected(tag.id)"
            [disabled]="isDisabled(tag.id)"
            [ngStyle]="isSelected(tag.id) ? styleFor(tag) : {}">
            {{ tag.label }}
          </mat-chip-option>
        }
      </mat-chip-listbox>
    }
  `,
  styleUrls: ['./tag-chip.scss'],
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
export class TagValuePicker implements ControlValueAccessor {
  /** Catalog the user can pick from. Blank-label entries are hidden. */
  readonly availableTags = input<readonly ClubTagDefinition[]>([]);
  /** Tag ids that should render as disabled chips (selected but not changeable). */
  readonly disabledIds = input<readonly string[]>([]);
  /** Empty-state copy when no definitions are available. */
  readonly emptyText = input<string>('No tags configured.');

  private readonly _value = signal<string[]>([]);
  protected readonly disabled = signal(false);

  /** Filters out blank-label definitions for picker UI. */
  protected readonly visibleTags = computed(() =>
    this.availableTags().filter(t => t.label.trim().length > 0),
  );

  private onChange: (value: string[]) => void = () => {};
  private onTouched: () => void = () => {};

  /** ControlValueAccessor: receive value from the parent form. */
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

  protected styleFor(tag: ClubTagDefinition): Record<string, string> {
    return tagChipStyle(tag.color);
  }

  protected onSelectionChange(event: MatChipListboxChange): void {
    const next: string[] = Array.isArray(event.value)
      ? [...event.value as string[]]
      : event.value
        ? [event.value as string]
        : [];

    // Preserve any selected ids the picker currently doesn't expose (e.g.
    // a definition whose `label` was blanked after the entry was tagged).
    // Without this, every chip toggle would silently drop them.
    const preserved = this._value().filter(
      id => !this.visibleTags().some(t => t.id === id),
    );
    const merged = [...new Set([...preserved, ...next])];
    this._value.set(merged);
    this.onChange(merged);
    this.onTouched();
  }
}
