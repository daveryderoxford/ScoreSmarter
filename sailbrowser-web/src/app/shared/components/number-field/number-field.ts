import { computed, Directive, ElementRef, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  coerceNumberFieldMode,
  isAllowedNumberFieldText,
  normalizeNumberFieldInsert,
  numberFieldCommittedValue,
  numberFieldInputMode,
  numberFieldPattern,
  replaceNumberFieldSelection,
  sanitizeNumberFieldText,
} from './number-field-value';

/**
 * Attribute filter and value accessor for numeric `<input>` fields. Blocks illegal
 * keystrokes, sets `inputmode` and `pattern` for the mobile keyboard, and stores a
 * number on the FormControl. Selecting the field on a phone re-fires `input` with the
 * same digits; that notification is ignored so the control stays pristine.
 *
 * ```html
 * <input matInput appNumberField formControlName="laps">
 * <input matInput appNumberField="decimal" formControlName="min">
 * <input matInput appNumberField="signedDecimal" formControlName="latitude">
 * ```
 */
@Directive({
  selector: 'input[appNumberField]',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => NumberField),
    multi: true,
  }],
  host: {
    type: 'text',
    '[attr.inputmode]': 'inputMode()',
    '[attr.pattern]': 'pattern()',
    '(keydown)': 'onKeydown($event)',
    '(beforeinput)': 'onBeforeInput($event)',
    '(paste)': 'onPaste($event)',
    '(drop)': 'onDrop($event)',
    '(input)': 'onInput()',
    '(blur)': 'onBlur()',
    '(compositionend)': 'onInput()',
  },
})
export class NumberField implements ControlValueAccessor {
  private readonly elementRef = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};
  /** Last number pushed to the form, or loaded by `writeValue`. */
  private committed: number | null = null;

  readonly mode = input(coerceNumberFieldMode(undefined), {
    alias: 'appNumberField',
    transform: coerceNumberFieldMode,
  });

  readonly inputMode = computed(() => numberFieldInputMode(this.mode()));
  readonly pattern = computed(() => numberFieldPattern(this.mode()));

  writeValue(value: number | string | null): void {
    const parsed = coerceNumberModel(value);
    this.committed = parsed;
    const input = this.elementRef.nativeElement;
    const rendered = parsed == null ? '' : String(parsed);
    if (input.value === rendered) return;
    // Keep a partial such as "1." or "1.50" when it already means this number.
    if (parsed != null && numberFieldCommittedValue(input.value) === parsed) return;
    input.value = rendered;
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.elementRef.nativeElement.disabled = isDisabled;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key.length !== 1) {
      return;
    }

    const input = this.elementRef.nativeElement;
    const insert = normalizeNumberFieldInsert(event.key, this.mode());
    if (this.wouldAllow(input, insert)) {
      if (insert !== event.key) {
        event.preventDefault();
        this.insertAtSelection(input, insert);
      }
      return;
    }

    event.preventDefault();
  }

  onBeforeInput(event: InputEvent): void {
    if (event.isComposing) {
      return;
    }

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

    const input = this.elementRef.nativeElement;
    const insert = normalizeNumberFieldInsert(event.data ?? '', this.mode());
    if (this.wouldAllow(input, insert)) {
      if (insert !== (event.data ?? '')) {
        event.preventDefault();
        this.insertAtSelection(input, insert);
      }
      return;
    }

    event.preventDefault();
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.replaceSelectionWithSanitized(event.clipboardData?.getData('text') ?? '');
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.replaceSelectionWithSanitized(event.dataTransfer?.getData('text') ?? '');
  }

  onInput(): void {
    const input = this.elementRef.nativeElement;
    if (input.disabled) return;
    const sanitized = sanitizeNumberFieldText(input.value, this.mode());
    if (sanitized !== input.value) {
      const caret = Math.min(input.selectionStart ?? sanitized.length, sanitized.length);
      this.applyValue(input, sanitized, caret);
      return;
    }
    this.commitParsed(sanitized);
  }

  onBlur(): void {
    const input = this.elementRef.nativeElement;
    const parsed = numberFieldCommittedValue(input.value);
    if (parsed === undefined) {
      input.value = this.committed == null ? '' : String(this.committed);
    } else {
      this.commitParsed(input.value);
    }
    this.onTouched();
  }

  private wouldAllow(input: HTMLInputElement, insert: string): boolean {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = replaceNumberFieldSelection(input.value, start, end, insert);
    return isAllowedNumberFieldText(next, this.mode());
  }

  private replaceSelectionWithSanitized(raw: string): void {
    const input = this.elementRef.nativeElement;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const suffix = input.value.slice(end);
    const next = replaceNumberFieldSelection(
      input.value,
      start,
      end,
      normalizeNumberFieldInsert(raw, this.mode()),
    );
    const sanitized = sanitizeNumberFieldText(next, this.mode());
    const caret = sanitized.endsWith(suffix) ? sanitized.length - suffix.length : sanitized.length;
    this.applyValue(input, sanitized, Math.max(0, caret));
  }

  private insertAtSelection(input: HTMLInputElement, insert: string): void {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = replaceNumberFieldSelection(input.value, start, end, insert);
    this.applyValue(input, next, start + insert.length);
  }

  private applyValue(input: HTMLInputElement, value: string, caret: number): void {
    input.value = value;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Notify the form only when the parsed number differs. Angular dirties on every callback. */
  private commitParsed(text: string): void {
    const parsed = numberFieldCommittedValue(text);
    if (parsed === undefined || parsed === this.committed) return;
    this.committed = parsed;
    this.onChange(parsed);
  }
}

function coerceNumberModel(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type { NumberFieldMode } from './number-field-value';
