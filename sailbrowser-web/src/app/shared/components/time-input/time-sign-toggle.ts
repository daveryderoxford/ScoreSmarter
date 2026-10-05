import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TimeInput } from './time-input';

/**
 * Plus/minus prefix for elapsed start times. Default is plus. Place it in a
 * `mat-form-field` with `matPrefix` next to an `appTimeInput="mss"` field.
 */
@Component({
  selector: 'app-time-sign-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [disabled]="timeInput().isDisabled()"
      [attr.aria-pressed]="timeInput().negative()"
      [attr.aria-label]="ariaLabel()"
      (mousedown)="$event.preventDefault()"
      (click)="onClick($event)"
    >
      @if (timeInput().negative()) {
        <span aria-hidden="true">−</span>
      } @else {
        <span aria-hidden="true">+</span>
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
    button {
      appearance: none;
      border: 0;
      background: transparent;
      min-width: 2rem;
      height: 2.5rem;
      padding: 0 0.25rem;
      font-size: 1.25rem;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      cursor: pointer;
      color: var(--mat-sys-on-surface);
    }
    button:disabled {
      opacity: 0.38;
      cursor: default;
    }
  `,
})
export class TimeSignToggle {
  readonly timeInput = input.required<TimeInput>();

  readonly ariaLabel = computed(() =>
    this.timeInput().negative()
      ? 'Negative elapsed: watch started after the gun. Tap for plus.'
      : 'Positive elapsed. Tap for minus if the watch started after the gun.',
  );

  onClick(event: Event): void {
    event.preventDefault();
    this.timeInput().toggleSign();
  }
}
