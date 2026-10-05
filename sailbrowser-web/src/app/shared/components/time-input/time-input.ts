import { computed, Directive, effect, ElementRef, forwardRef, inject, input, signal, untracked } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
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
  type TimeInputFormat,
} from './time-input-segments';

export function coerceTimeInputFormat(
  value: TimeInputFormat | '' | boolean | null | undefined,
): TimeInputFormat {
  return value === 'mss' ? 'mss' : 'hms';
}

/**
 * Attribute mask on a native `<input>` (typically with `matInput`). Keeps Material
 * owning the form-field chrome; this directive is only the value accessor plus
 * keystroke/paste filter. The bound FormControl is seconds (`hms` seconds-of-day,
 * `mss` elapsed seconds, signed).
 *
 * Elapsed (`mss`) values can be negative (watch started after the gun). The sign is
 * flipped with {@link toggleSign} (a `+`/`−` prefix) rather than a keyboard minus,
 * because iOS decimal pads have no `-`. Default sign is plus.
 *
 * ```html
 * <input matInput appTimeInput formControlName="start">
 * <input #t="appTimeInput" matInput appTimeInput="mss" formControlName="elapsed">
 * <app-time-sign-toggle matPrefix [timeInput]="t" />
 * ```
 */
@Directive({
  selector: 'input[appTimeInput]',
  exportAs: 'appTimeInput',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeInput), multi: true }],
  host: {
    type: 'text',
    autocomplete: 'off',
    '[attr.inputmode]': 'inputMode()',
    '[attr.pattern]': 'pattern()',
    '[attr.placeholder]': 'placeholderText()',
    '(keydown)': 'onKeydown($event)',
    '(beforeinput)': 'onBeforeInput($event)',
    '(paste)': 'onPaste($event)',
    '(drop)': 'onDrop($event)',
    '(input)': 'onInput()',
    '(blur)': 'onBlur()',
    '(compositionend)': 'onInput()',
  },
})
export class TimeInput implements ControlValueAccessor {
  private readonly elementRef = inject<ElementRef<HTMLInputElement>>(ElementRef);

  readonly format = input(coerceTimeInputFormat(undefined), {
    alias: 'appTimeInput',
    transform: coerceTimeInputFormat,
  });

  /**
   * Clock (`hms`) uses a digit pad. Elapsed (`mss`) uses `decimal` for digits; sign is
   * the plus/minus control because mobile decimal pads often omit `-`.
   */
  readonly inputMode = computed<'numeric' | 'decimal'>(() =>
    this.format() === 'mss' ? 'decimal' : 'numeric',
  );
  readonly pattern = computed(() => '[0-9]*');

  /** True when elapsed time is negative. Empty/clock defaults to plus (`false`). */
  readonly negative = signal(false);
  readonly isDisabled = signal(false);

  private committedSeconds: number | null = null;
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    effect(() => {
      const fmt = this.format();
      untracked(() => this.renderCommitted(fmt));
    });
  }

  placeholderText(): string {
    return placeholderForFormat(this.format());
  }

  focusInput(): void {
    if (this.isDisabled()) return;
    this.elementRef.nativeElement.focus();
  }

  /** Flip elapsed sign. No-op for clock times. Empty fields stay empty (default plus until this is used). */
  toggleSign(): void {
    if (this.isDisabled() || this.format() !== 'mss') return;
    this.negative.update(v => !v);
    const unsigned = this.unsignedDisplay();
    this.maybeCommitComplete(unsigned);
  }

  writeValue(value: number | null): void {
    this.committedSeconds = value;
    this.renderCommitted(this.format());
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    this.elementRef.nativeElement.disabled = isDisabled;
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.isDisabled() || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const input = this.elementRef.nativeElement;
    const { selectionStart, selectionEnd } = input;
    if (selectionStart === null || selectionEnd === null) return;

    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault();
      this.applyDigit(event.key, selectionStart, selectionEnd);
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.applyEdit(applyBackspace(input.value, selectionStart, selectionEnd, this.format()));
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      this.applyEdit(applyDelete(input.value, selectionStart, selectionEnd, this.format()));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.applyEdit(adjustSegment(input.value, selectionStart, 1, this.format()));
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.applyEdit(adjustSegment(input.value, selectionStart, -1, this.format()));
      return;
    }
    if (this.format() === 'mss' && event.key === '-') {
      event.preventDefault();
      this.toggleSign();
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
    }
  }

  onBeforeInput(event: InputEvent): void {
    if (this.isDisabled() || event.isComposing) return;

    const type = event.inputType;
    if (
      type.startsWith('delete') ||
      type === 'historyUndo' ||
      type === 'historyRedo' ||
      type.startsWith('insertComposition') ||
      type === 'insertFromPaste' ||
      type === 'insertFromDrop'
    ) {
      return;
    }

    const data = event.data ?? '';
    const input = this.elementRef.nativeElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    if (/^\d$/.test(data)) {
      event.preventDefault();
      this.applyDigit(data, start, end);
      return;
    }
    if (this.format() === 'mss' && data === '-') {
      event.preventDefault();
      this.toggleSign();
      return;
    }

    event.preventDefault();
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.applyPasted(event.clipboardData?.getData('text') ?? '');
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.applyPasted(event.dataTransfer?.getData('text') ?? '');
  }

  onInput(): void {
    if (this.isDisabled()) return;
    this.remaskFromNative();
  }

  onBlur(): void {
    this.onTouched();
    const fmt = this.format();
    const raw = this.unsignedDisplay().trim();
    if (!raw) {
      this.negative.set(false);
      this.commitValue(null, '');
      return;
    }

    const normalized = normalizeOnBlur(raw, fmt);
    const parsed = displayToSeconds(normalized, fmt);
    if (parsed != null) {
      const signed = this.signedSeconds(parsed);
      this.commitValue(signed, signed == null ? '' : this.unsignedFromSeconds(signed));
    } else if (this.committedSeconds != null) {
      this.renderCommitted(fmt);
    } else {
      this.negative.set(false);
      this.commitValue(null, '');
    }
  }

  private applyDigit(digit: string, start: number, end: number): void {
    const result = applyDigitInput(this.elementRef.nativeElement.value, start, end, digit, this.format());
    if (result) this.applyEdit(result);
  }

  private applyPasted(raw: string): void {
    const fmt = this.format();
    if (fmt === 'mss') {
      this.negative.set(raw.trim().startsWith('-'));
    }
    const normalized = normalizePastedText(raw, fmt);
    const unsigned = this.stripLeadingMinus(normalized);
    this.applyEdit({ text: unsigned, selection: unsigned.length });
  }

  private remaskFromNative(): void {
    const input = this.elementRef.nativeElement;
    const fmt = this.format();
    let normalized = normalizePastedText(input.value, fmt);
    if (fmt === 'mss' && normalized.startsWith('-')) {
      this.negative.set(true);
      normalized = normalized.slice(1);
    }
    if (normalized !== input.value) {
      input.value = normalized;
    }
    this.maybeCommitComplete(normalized);
  }

  private applyEdit(result: { text: string; selection: number }): void {
    const unsigned = this.stripLeadingMinus(result.text);
    const input = this.elementRef.nativeElement;
    input.value = unsigned;
    this.queueCaret(Math.min(result.selection, unsigned.length));
    this.maybeCommitComplete(unsigned);
  }

  private maybeCommitComplete(display: string): void {
    const fmt = this.format();
    const unsigned = this.stripLeadingMinus(display);
    if (!isCompleteDisplay(unsigned, fmt)) return;
    const parsed = displayToSeconds(unsigned, fmt);
    if (parsed != null) {
      this.commitValue(this.signedSeconds(parsed), unsigned, false);
    }
  }

  private commitValue(seconds: number | null, display: string, writeDisplay = true): void {
    this.committedSeconds = seconds;
    if (this.format() === 'mss') {
      this.negative.set(seconds != null && seconds < 0);
    }
    if (writeDisplay) {
      this.elementRef.nativeElement.value = display;
    }
    this.onChange(seconds);
  }

  private renderCommitted(fmt: TimeInputFormat): void {
    const input = this.elementRef.nativeElement;
    if (this.committedSeconds == null) {
      this.negative.set(false);
      input.value = '';
      return;
    }
    this.negative.set(fmt === 'mss' && this.committedSeconds < 0);
    input.value = this.unsignedFromSeconds(this.committedSeconds);
  }

  private signedSeconds(magnitude: number): number {
    return this.format() === 'mss' && this.negative() ? -Math.abs(magnitude) : magnitude;
  }

  private unsignedFromSeconds(seconds: number): string {
    const fmt = this.format();
    return secondsToDisplay(fmt === 'mss' ? Math.abs(seconds) : seconds, fmt);
  }

  private unsignedDisplay(): string {
    return this.stripLeadingMinus(this.elementRef.nativeElement.value);
  }

  private stripLeadingMinus(text: string): string {
    return text.startsWith('-') ? text.slice(1) : text;
  }

  private queueCaret(position: number): void {
    const input = this.elementRef.nativeElement;
    queueMicrotask(() => input.setSelectionRange(position, position));
  }
}
