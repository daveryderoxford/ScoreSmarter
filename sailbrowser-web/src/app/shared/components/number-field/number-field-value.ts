export type NumberFieldMode = 'integer' | 'decimal' | 'signedDecimal';

const PARTIAL_PATTERNS: Record<NumberFieldMode, RegExp> = {
  integer: /^\d*$/,
  decimal: /^\d*\.?\d*$/,
  signedDecimal: /^-?\d*\.?\d*$/,
};

/** Treat a bare or unknown `appNumberField` value as integer. */
export function coerceNumberFieldMode(
  value: NumberFieldMode | '' | boolean | null | undefined,
): NumberFieldMode {
  if (value === 'decimal' || value === 'signedDecimal' || value === 'integer') {
    return value;
  }
  return 'integer';
}

export function numberFieldInputMode(mode: NumberFieldMode): 'numeric' | 'decimal' {
  return mode === 'integer' ? 'numeric' : 'decimal';
}

export function numberFieldPattern(mode: NumberFieldMode): string {
  switch (mode) {
    case 'integer':
      return '[0-9]*';
    case 'decimal':
      return '[0-9]*[.]?[0-9]*';
    case 'signedDecimal':
      return '-?[0-9]*[.]?[0-9]*';
  }
}

/** True for values that are legal while typing, including empty, '-', '.', and '1.'. */
export function isAllowedNumberFieldText(value: string, mode: NumberFieldMode): boolean {
  return PARTIAL_PATTERNS[mode].test(value);
}

/** Map locale decimal commas so European keyboards can type a point. */
export function normalizeNumberFieldInsert(text: string, mode: NumberFieldMode): string {
  return mode === 'integer' ? text : text.replace(/,/g, '.');
}

/**
 * Drop characters that cannot appear in this mode (letters, extra dots, a minus
 * that is not leading). Digits and a single decimal point are kept in order.
 */
export function sanitizeNumberFieldText(value: string, mode: NumberFieldMode): string {
  const source = normalizeNumberFieldInsert(value, mode);
  if (isAllowedNumberFieldText(source, mode)) {
    return source;
  }

  const allowMinus = mode === 'signedDecimal';
  const allowDot = mode !== 'integer';
  let out = '';
  let seenDot = false;

  for (const ch of source) {
    if (ch === '-' && allowMinus && out.length === 0) {
      out += ch;
    } else if (ch === '.' && allowDot && !seenDot) {
      out += ch;
      seenDot = true;
    } else if (ch >= '0' && ch <= '9') {
      out += ch;
    }
  }

  return out;
}

export function replaceNumberFieldSelection(
  value: string,
  start: number,
  end: number,
  insert: string,
): string {
  return value.slice(0, start) + insert + value.slice(end);
}
