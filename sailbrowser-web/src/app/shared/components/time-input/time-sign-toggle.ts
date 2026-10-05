import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TimeInput } from './time-input';

/**
 * Plus/minus prefix for elapsed start times. Default is plus. Place it in a
 * `mat-form-field` with `matPrefix` next to an `appTimeInput="mss"` field.
 */
@Component({
  selector: 'app-time-sign-toggle',
  imports: [MatButtonModule],
  template: `
    <button
      type="button"
      matIconButton
      [disabled]="timeInput().isDisabled()"
      [attr.aria-pressed]="timeInput().negative()"
      [attr.aria-label]="ariaLabel()"
      (mousedown)="$event.preventDefault()"
      (click)="onClick($event)"
    >
      {{ label() }}
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    button {
      font-size: 1.125rem;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class TimeSignToggle {
  readonly timeInput = input.required<TimeInput>();

  readonly label = computed(() => (this.timeInput().negative() ? '−' : '+'));
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
