import { computed, Directive, effect, ElementRef, forwardRef, inject, input, untracked } from '@angular/core';
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
  toggleMssSign,
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
 * ```html
 * <input matInput appTimeInput formControlName="start">
 * <input matInput appTimeInput="mss" formControlName="elapsed">
 * ```
 */
@Directive({
  selector: 'input[appTimeInput]',
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
   * Clock (`hms`) uses a digit pad. Elapsed (`mss`) uses `decimal` so mobile keyboards
   * still expose `-` without opening a full QWERTY keyboard; illegal keys are filtered.
   */
  readonly inputMode = computed<'numeric' | 'decimal'>(() =>
    this.format() === 'mss' ? 'decimal' : 'numeric',
  );
  readonly pattern = computed(() => (this.format() === 'mss' ? '-?[0-9]*' : '[0-9]*'));

  private committedSeconds: number | null = null;
  private disabled = false;
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
    if (this.disabled) return;
    this.elementRef.nativeElement.focus();
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
    this.disabled = isDisabled;
    this.elementRef.nativeElement.disabled = isDisabled;
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.disabled || event.isComposing) return;
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
      this.applyEdit(toggleMssSign(input.value, selectionStart));
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
    }
  }

  onBeforeInput(event: InputEvent): void {
    if (this.disabled || event.isComposing) return;

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
      this.applyEdit(toggleMssSign(input.value, start));
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
    if (this.disabled) return;
    this.remaskFromNative();
  }

  onBlur(): void {
    this.onTouched();
    const fmt = this.format();
    const raw = this.elementRef.nativeElement.value.trim();
    if (!raw) {
      this.commitValue(null, '');
      return;
    }

    const normalized = normalizeOnBlur(raw, fmt);
    const parsed = displayToSeconds(normalized, fmt);
    if (parsed != null) {
      this.commitValue(parsed, secondsToDisplay(parsed, fmt));
    } else if (this.committedSeconds != null) {
      this.renderCommitted(fmt);
    } else {
      this.commitValue(null, '');
    }
  }

  private applyDigit(digit: string, start: number, end: number): void {
    const result = applyDigitInput(this.elementRef.nativeElement.value, start, end, digit, this.format());
    if (result) this.applyEdit(result);
  }

  private applyPasted(raw: string): void {
    const normalized = normalizePastedText(raw, this.format());
    this.applyEdit({ text: normalized, selection: normalized.length });
  }

  private remaskFromNative(): void {
    const input = this.elementRef.nativeElement;
    const normalized = normalizePastedText(input.value, this.format());
    if (normalized !== input.value) {
      input.value = normalized;
    }
    this.maybeCommitComplete(normalized);
  }

  private applyEdit(result: { text: string; selection: number }): void {
    const input = this.elementRef.nativeElement;
    input.value = result.text;
    this.queueCaret(result.selection);
    this.maybeCommitComplete(result.text);
  }

  private maybeCommitComplete(display: string): void {
    const fmt = this.format();
    if (!isCompleteDisplay(display, fmt)) return;
    const parsed = displayToSeconds(display, fmt);
    if (parsed != null) {
      this.commitValue(parsed, display, false);
    }
  }

  private commitValue(seconds: number | null, display: string, writeDisplay = true): void {
    this.committedSeconds = seconds;
    if (writeDisplay) {
      this.elementRef.nativeElement.value = display;
    }
    this.onChange(seconds);
  }

  private renderCommitted(fmt: TimeInputFormat): void {
    const input = this.elementRef.nativeElement;
    input.value =
      this.committedSeconds == null ? '' : secondsToDisplay(this.committedSeconds, fmt);
  }

  private queueCaret(position: number): void {
    const input = this.elementRef.nativeElement;
    queueMicrotask(() => input.setSelectionRange(position, position));
  }
}
