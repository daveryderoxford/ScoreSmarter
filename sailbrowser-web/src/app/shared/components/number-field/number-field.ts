import { computed, Directive, ElementRef, inject, input } from '@angular/core';
import {
  coerceNumberFieldMode,
  isAllowedNumberFieldText,
  normalizeNumberFieldInsert,
  numberFieldInputMode,
  numberFieldPattern,
  replaceNumberFieldSelection,
  sanitizeNumberFieldText,
} from './number-field-value';

/**
 * Attribute filter for numeric `<input>` fields. Keeps the native control and
 * FormControl type; only blocks illegal keystrokes/paste and sets `inputmode`
 * plus `pattern` for the mobile keyboard and constraint validation.
 *
 * ```html
 * <input matInput appNumberField formControlName="laps">
 * <input matInput appNumberField="decimal" formControlName="min">
 * <input matInput appNumberField="signedDecimal" formControlName="latitude">
 * ```
 */
@Directive({
  selector: 'input[appNumberField]',
  host: {
    type: 'text',
    '[attr.inputmode]': 'inputMode()',
    '[attr.pattern]': 'pattern()',
    '(keydown)': 'onKeydown($event)',
    '(beforeinput)': 'onBeforeInput($event)',
    '(paste)': 'onPaste($event)',
    '(drop)': 'onDrop($event)',
    '(input)': 'onInput()',
    '(compositionend)': 'onInput()',
  },
})
export class NumberField {
  private readonly elementRef = inject<ElementRef<HTMLInputElement>>(ElementRef);

  readonly mode = input(coerceNumberFieldMode(undefined), {
    alias: 'appNumberField',
    transform: coerceNumberFieldMode,
  });

  readonly inputMode = computed(() => numberFieldInputMode(this.mode()));
  readonly pattern = computed(() => numberFieldPattern(this.mode()));

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
    const sanitized = sanitizeNumberFieldText(input.value, this.mode());
    if (sanitized === input.value) {
      return;
    }
    const caret = Math.min(input.selectionStart ?? sanitized.length, sanitized.length);
    this.applyValue(input, sanitized, caret);
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
}

export type { NumberFieldMode } from './number-field-value';
