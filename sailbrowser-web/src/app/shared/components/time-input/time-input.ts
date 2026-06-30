import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  input,
  OnInit,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { MatFormField, MatFormFieldControl } from '@angular/material/form-field';
import { FormFieldBase } from 'app/shared/components/form-field.base';
import { merge, of } from 'rxjs';
import {
  adjustSegment,
  applyBackspace,
  applyDelete,
  applyDigitInput,
  displayToSeconds,
  isCompleteDisplay,
  normalizeOnBlur,
  normalizePastedText,
  placeholderForFormat,
  secondsToDisplay,
  toggleMssSign,
  type TimeInputFormat,
} from './time-input-segments';

/**
 * Single-field, Chrome-style time entry that plugs into `<mat-form-field>` as a custom
 * `MatFormFieldControl` (see the Angular Material custom form field control guide).
 *
 * It is date-agnostic: the value is a plain `number` of seconds, so consumers compose the
 * `Date` themselves (e.g. via `shared/utils/time-utils`). Two layouts are supported via
 * `format`: `hms` (HH:mm:ss clock, seconds-of-day) and `mss` (mmm:ss elapsed, total seconds).
 */
@Component({
  selector: 'app-time-input',
  standalone: true,
  imports: [ReactiveFormsModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeInput), multi: true },
    { provide: MatFormFieldControl, useExisting: forwardRef(() => TimeInput) },
  ],
  template: `
    <input
      #nativeInput
      type="text"
      [attr.inputmode]="inputMode()"
      [attr.pattern]="inputPattern()"
      autocomplete="off"
      [formControl]="textControl"
      [placeholder]="shouldLabelFloat ? placeholderText() : ''"
      [attr.aria-labelledby]="parentFormField?.getLabelId()"
      (keydown)="onKeydown($event)"
      (input)="onInput()"
    />
  `,
  styles: [
    `
      :host {
        display: block;
      }

      input {
        width: 100%;
        border: none;
        outline: none;
        padding: 0;
        background: none;
        color: currentColor;
        font: inherit;
        letter-spacing: inherit;
      }
    `,
  ],
  host: {
    '[class.floating]': 'shouldLabelFloat',
    '[id]': 'id',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class TimeInput extends FormFieldBase<number> implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly parentFormField = inject(MatFormField, { optional: true });

  readonly format = input<TimeInputFormat>('hms');

  // `mss` allows negative elapsed values, so the keyboard must expose '-'. `inputmode="numeric"`
  // with a digit-only pattern hides the minus key on many mobile keyboards, so widen both for mss.
  readonly inputMode = computed<'numeric' | 'text'>(() => (this.format() === 'mss' ? 'text' : 'numeric'));
  readonly inputPattern = computed(() => (this.format() === 'mss' ? '-?[0-9]*' : '[0-9]*'));

  readonly textControl = new FormControl<string>('', { nonNullable: true });

  override controlType = 'app-time-input';

  private readonly nativeInput = viewChild<ElementRef<HTMLInputElement>>('nativeInput');

  private committedSeconds: number | null = null;

  constructor() {
    super(inject(ElementRef));
  }

  placeholderText(): string {
    return this.placeholder || placeholderForFormat(this.format());
  }

  /** Mirror the bound control's disabled state so the form field outline greys out. */
  override get disabled(): boolean {
    const c = this.ngControl?.control;
    return c ? c.disabled : super.disabled;
  }

  override set disabled(value: boolean) {
    this.applyDisabled(value);
  }

  override get empty(): boolean {
    return !this.textControl.value;
  }

  override ngOnInit(): void {
    super.ngOnInit();
    const ctrl = this.ngControl?.control;
    if (!ctrl) return;

    // Parent FormControl.disable({ emitEvent: false }) does not notify the CVA; keep the inner
    // input and MatFormFieldControl.disabled aligned with the real control state.
    merge(of(undefined), ctrl.statusChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (ctrl.disabled !== this.textControl.disabled) {
          this.applyDisabled(ctrl.disabled);
        }
      });
  }

  /** Move focus to the time field (e.g. when tabbing in from a sibling control). */
  focusInput(): void {
    if (this.disabled) return;
    this.nativeInput()?.nativeElement.focus();
  }

  override onContainerClick(): void {
    this.focusInput();
  }

  onFocusIn(): void {
    this.onFocus();
  }

  onFocusOut(event: FocusEvent): void {
    if (!this._elementRef.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.commitOnBlur();
    }
  }

  override writeValue(value: number | null): void {
    super.writeValue(value);
    this.committedSeconds = value;
    if (value == null) {
      this.textControl.setValue('', { emitEvent: false });
      return;
    }
    this.textControl.setValue(secondsToDisplay(value, this.format()), { emitEvent: false });
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.disabled) return;

    const input = this.nativeInput()?.nativeElement;
    if (!input) return;

    const { selectionStart, selectionEnd } = input;
    if (selectionStart === null || selectionEnd === null) return;

    const fmt = this.format();
    let result: { text: string; selection: number } | null = null;

    if (event.key >= '0' && event.key <= '9') {
      result = applyDigitInput(this.textControl.value, selectionStart, selectionEnd, event.key, fmt);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      result = applyBackspace(this.textControl.value, selectionStart, selectionEnd, fmt);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      result = applyDelete(this.textControl.value, selectionStart, selectionEnd, fmt);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      result = adjustSegment(this.textControl.value, selectionStart, 1, fmt);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      result = adjustSegment(this.textControl.value, selectionStart, -1, fmt);
    } else if (fmt === 'mss' && event.key === '-') {
      // Elapsed times can be negative (stopwatch started after the gun); '-' toggles sign.
      event.preventDefault();
      result = toggleMssSign(this.textControl.value, selectionStart);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Ignore any other printable character (letters, separators, symbols) rather than
      // letting it land in the field and invalidate the time.
      event.preventDefault();
      return;
    } else {
      // Allow navigation/editing shortcuts: Tab, Home, End, ArrowLeft/Right, Ctrl/Cmd+A/C/V, etc.
      return;
    }

    if (!result) return;
    event.preventDefault();
    this.textControl.setValue(result.text, { emitEvent: false });
    this.queueCaret(result.selection);

    if (isCompleteDisplay(result.text, fmt)) {
      const parsed = displayToSeconds(result.text, fmt);
      if (parsed != null) {
        this.commitValue(parsed, result.text);
      }
    }
  }

  /**
   * Handle text changes that bypass {@link onKeydown}: paste (keyboard or context menu), mobile
   * autofill/autocorrect, IME composition, and drag-and-drop. The keydown path `preventDefault`s
   * physical key edits, so this fires only for these out-of-band changes. We re-mask the raw text
   * and commit immediately when it forms a complete value, keeping the outer FormControl in sync
   * (e.g. so `Validators.required` clears) rather than waiting for blur.
   */
  onInput(): void {
    if (this.disabled) return;

    const input = this.nativeInput()?.nativeElement;
    if (!input) return;

    const fmt = this.format();
    const normalized = normalizePastedText(input.value, fmt);

    // Re-mask the field in place; setting `value` directly does not re-trigger `input`.
    if (normalized !== input.value) {
      input.value = normalized;
    }
    this.textControl.setValue(normalized, { emitEvent: false });

    if (isCompleteDisplay(normalized, fmt)) {
      const parsed = displayToSeconds(normalized, fmt);
      if (parsed != null) {
        this.commitValue(parsed, normalized);
      }
    }
  }

  private commitOnBlur(): void {
    this.onBlur();
    const fmt = this.format();
    const raw = this.textControl.value.trim();
    if (!raw) {
      this.commitValue(null, '');
      return;
    }

    const normalized = normalizeOnBlur(raw, fmt);
    const parsed = displayToSeconds(normalized, fmt);
    if (parsed != null) {
      this.textControl.setValue(secondsToDisplay(parsed, fmt), { emitEvent: false });
      this.commitValue(parsed, this.textControl.value);
    } else if (this.committedSeconds != null) {
      this.textControl.setValue(secondsToDisplay(this.committedSeconds, fmt), { emitEvent: false });
    } else {
      this.textControl.setValue('', { emitEvent: false });
    }
  }

  private commitValue(seconds: number | null, display: string): void {
    this.committedSeconds = seconds;
    this.value = seconds;
    this._onChange(seconds);
    if (display !== this.textControl.value) {
      this.textControl.setValue(display, { emitEvent: false });
    }
    this.stateChanges.next();
  }

  private applyDisabled(disabled: boolean): void {
    super.disabled = disabled;
    if (disabled) {
      this.textControl.disable({ emitEvent: false });
    } else {
      this.textControl.enable({ emitEvent: false });
    }
    this.stateChanges.next();
  }

  private queueCaret(position: number): void {
    const input = this.nativeInput()?.nativeElement;
    if (!input) return;
    queueMicrotask(() => input.setSelectionRange(position, position));
  }
}
