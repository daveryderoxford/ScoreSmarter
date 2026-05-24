import type { AbstractControl, ValidationErrors } from '@angular/forms';

/** Stored sail / boat identifier (free-form string; club racing uses many formats). */
export type SailNumber = string;

/**
 * Coerce Firestore / form input to canonical storage form.
 * - Legacy numeric fields become decimal strings without fractional part.
 * - Whitespace trimmed/collapsed.
 * - Leading letters (country code) uppercased; digits and trailing suffix unchanged.
 */
export function normalizeSailNumber(raw: unknown): string {
  if (raw == null) {
    return '';
  }
  let text: string;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return '';
    }
    text = String(Math.trunc(raw));
  } else {
    text = String(raw);
  }

  const compact = text.trim().replace(/\s+/g, '');
  if (!compact) {
    return '';
  }

  const digitIndex = compact.search(/\d/);
  if (digitIndex < 0) {
    return compact.toUpperCase();
  }

  const countryCode = compact.slice(0, digitIndex).toUpperCase();
  const rest = compact.slice(digitIndex);
  return `${countryCode}${rest}`;
}

/** True when normalized values are identical (e.g. `123` number vs `"123"` string). */
export function sailNumbersEqual(a: unknown, b: unknown): boolean {
  const na = normalizeSailNumber(a);
  const nb = normalizeSailNumber(b);
  if (!na || !nb) {
    return false;
  }
  return na === nb;
}

/** Sort comparator: locale-aware with numeric segments (`2` before `10`). */
export function compareSailNumbers(a: unknown, b: unknown): number {
  return normalizeSailNumber(a).localeCompare(normalizeSailNumber(b), undefined, { numeric: true });
}

/** Whether a value is present after normalization (required non-empty string). */
export function isValidSailNumber(raw: unknown): boolean {
  return normalizeSailNumber(raw).length > 0;
}

/**
 * Search helper: normalized substring match on full sail, or suffix match on digit run.
 * Supports RO shorthand (e.g. query `345` matches stored `12345`) when digits are present.
 */
export function sailNumberMatchesSearch(stored: unknown, query: unknown): boolean {
  const q = normalizeSailNumber(query);
  if (!q) {
    return true;
  }
  const s = normalizeSailNumber(stored);
  if (!s) {
    return false;
  }
  if (s.toLowerCase().includes(q.toLowerCase())) {
    return true;
  }
  const digits = s.replace(/\D/g, '');
  const qDigits = q.replace(/\D/g, '');
  if (qDigits && digits.endsWith(qDigits)) {
    return true;
  }
  return false;
}

/** Reactive-forms validator: sail number is required (any non-empty string). */
export function sailNumberValidator(control: AbstractControl): ValidationErrors | null {
  return isValidSailNumber(control.value) ? null : { sailNumber: true };
}
