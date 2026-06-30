export type TimeInputFormat = 'hms' | 'mss';

export interface SegmentEditResult {
  text: string;
  selection: number;
}

const HMS_MAX_DIGITS = 6;
const MSS_MAX_DIGITS = 7; // e.g. 99999:99 → practical cap

export function placeholderForFormat(format: TimeInputFormat): string {
  return format === 'hms' ? 'hh:mm:ss' : 'mmm:ss';
}

export function extractDigits(text: string): string {
  return text.replace(/\D/g, '');
}

/** Build display string from a digit-only stream. */
export function digitsToDisplay(digits: string, format: TimeInputFormat): string {
  const max = format === 'hms' ? HMS_MAX_DIGITS : MSS_MAX_DIGITS;
  const d = digits.slice(0, max);
  if (!d) return '';

  if (format === 'hms') {
    if (d.length <= 2) return d;
    if (d.length === 3) return `${d.slice(0, 2)}:${d.slice(2)}`;
    if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2, 4)}`;
    if (d.length === 5) return `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4)}`;
    return `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4, 6)}`;
  }

  if (d.length <= 2) return d;
  return `${d.slice(0, -2)}:${d.slice(-2)}`;
}

/** Map a display caret position to a digit index (0-based). */
export function caretToDigitIndex(text: string, caret: number, format: TimeInputFormat): number {
  const sep = ':';
  let digitIndex = 0;
  for (let i = 0; i < caret && i < text.length; i++) {
    if (text[i] !== sep) digitIndex++;
  }
  return digitIndex;
}

/** Map digit index to display caret (after that digit). */
export function digitIndexToCaret(digits: string, digitIndex: number, format: TimeInputFormat): number {
  const display = digitsToDisplay(digits, format);
  if (digitIndex <= 0) return 0;
  let count = 0;
  for (let i = 0; i < display.length; i++) {
    if (display[i] !== ':') {
      count++;
      if (count === digitIndex) return i + 1;
    }
  }
  return display.length;
}

/**
 * Run an unsigned editing operation while preserving an optional leading `-` (mss only).
 * The leading sign is stripped before delegating and re-applied after, with carets shifted
 * by one to account for it. `hms` (and unsigned mss) pass straight through.
 */
function withMssSign(
  format: TimeInputFormat,
  text: string,
  selStart: number,
  selEnd: number,
  core: (t: string, s: number, e: number) => SegmentEditResult,
): SegmentEditResult {
  if (format !== 'mss' || !text.startsWith('-')) {
    return core(text, selStart, selEnd);
  }
  const r = core(text.slice(1), Math.max(0, selStart - 1), Math.max(0, selEnd - 1));
  if (!r.text) return { text: '', selection: 0 };
  return { text: `-${r.text}`, selection: r.selection + 1 };
}

/** Toggle a leading `-` on the display (mss only), keeping the caret aligned. */
export function toggleMssSign(text: string, caret: number): SegmentEditResult {
  if (text.startsWith('-')) {
    return { text: text.slice(1), selection: Math.max(0, caret - 1) };
  }
  return { text: `-${text}`, selection: caret + 1 };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Render a numeric value as the masked display string.
 * - `hms`: seconds-of-day (0..86399) -> `HH:mm:ss` (clamped non-negative).
 * - `mss`: total elapsed seconds (unbounded, signed) -> `mmm:ss`, e.g. `-1:30`.
 */
export function secondsToDisplay(seconds: number, format: TimeInputFormat): string {
  if (format === 'hms') {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600) % 24;
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  const rounded = Math.round(seconds);
  const neg = rounded < 0;
  const total = Math.abs(rounded);
  const minutes = Math.floor(total / 60);
  const seconds_ = total % 60;
  return `${neg ? '-' : ''}${minutes}:${pad2(seconds_)}`;
}

function normalizeOnBlurCore(text: string, format: TimeInputFormat): string {
  const digits = extractDigits(text);
  if (!digits) return '';

  if (format === 'hms') {
    if (digits.length <= 2) {
      return `${digits.padStart(2, '0')}:00:00`;
    }
    const padded = digits.padEnd(6, '0').slice(0, 6);
    return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
  }

  if (digits.length <= 2) {
    return `${Number(digits)}:00`;
  }
  return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
}

export function normalizeOnBlur(text: string, format: TimeInputFormat): string {
  const trimmed = text.trim();
  if (format === 'mss' && trimmed.startsWith('-')) {
    const body = normalizeOnBlurCore(trimmed.slice(1), format);
    return body ? `-${body}` : '';
  }
  return normalizeOnBlurCore(text, format);
}

/**
 * Parse a complete display string to a numeric value, or null if invalid.
 * - `hms`: `HH:mm:ss` -> seconds-of-day, with range validation.
 * - `mss`: `mmm:ss` -> total elapsed seconds.
 */
export function displayToSeconds(text: string, format: TimeInputFormat): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (format === 'hms') {
    const match = /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(trimmed);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  const match = /^(-?)(\d+):(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (seconds > 59) return null;
  return sign * (minutes * 60 + seconds);
}

export function isCompleteDisplay(text: string, format: TimeInputFormat): boolean {
  if (format === 'hms') {
    return /^\d{2}:\d{2}:\d{2}$/.test(text);
  }
  return /^-?\d+:\d{2}$/.test(text);
}

/**
 * Normalize free-form text (paste, autofill, IME, mobile autocorrect) into the masked
 * display string. Non-digits are dropped, a leading `-` is preserved for `mss`, and the
 * remaining digits are re-masked via {@link digitsToDisplay}. Returns `''` when there are
 * no usable digits.
 */
export function normalizePastedText(raw: string, format: TimeInputFormat): string {
  const display = digitsToDisplay(extractDigits(raw), format);
  if (!display) return '';
  if (format === 'mss' && raw.trim().startsWith('-')) {
    return `-${display}`;
  }
  return display;
}

function applyDigitInputCore(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  digit: string,
  format: TimeInputFormat,
): SegmentEditResult {
  const digits = extractDigits(text);
  const max = format === 'hms' ? HMS_MAX_DIGITS : MSS_MAX_DIGITS;
  const startIdx = caretToDigitIndex(text, selectionStart, format);
  const endIdx = caretToDigitIndex(text, selectionEnd, format);
  const before = digits.slice(0, startIdx);
  const after = digits.slice(endIdx);
  const next = (before + digit + after).slice(0, max);
  const display = digitsToDisplay(next, format);
  const newCaret = digitIndexToCaret(next, startIdx + 1, format);
  return { text: display, selection: newCaret };
}

export function applyDigitInput(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  digit: string,
  format: TimeInputFormat,
): SegmentEditResult | null {
  if (!/^\d$/.test(digit)) return null;
  return withMssSign(format, text, selectionStart, selectionEnd, (t, s, e) =>
    applyDigitInputCore(t, s, e, digit, format),
  );
}

function applyBackspaceCore(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: TimeInputFormat,
): SegmentEditResult {
  const digits = extractDigits(text);
  if (!digits) return { text: '', selection: 0 };

  const startIdx = caretToDigitIndex(text, selectionStart, format);
  const endIdx = caretToDigitIndex(text, selectionEnd, format);

  let next: string;
  let newDigitIdx: number;
  if (startIdx !== endIdx) {
    next = digits.slice(0, startIdx) + digits.slice(endIdx);
    newDigitIdx = startIdx;
  } else if (startIdx === 0) {
    return { text, selection: selectionStart };
  } else {
    next = digits.slice(0, startIdx - 1) + digits.slice(startIdx);
    newDigitIdx = startIdx - 1;
  }

  const display = digitsToDisplay(next, format);
  return { text: display, selection: digitIndexToCaret(next, newDigitIdx, format) };
}

export function applyBackspace(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: TimeInputFormat,
): SegmentEditResult {
  return withMssSign(format, text, selectionStart, selectionEnd, (t, s, e) =>
    applyBackspaceCore(t, s, e, format),
  );
}

function applyDeleteCore(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: TimeInputFormat,
): SegmentEditResult {
  const digits = extractDigits(text);
  if (!digits) return { text: '', selection: 0 };

  const startIdx = caretToDigitIndex(text, selectionStart, format);
  const endIdx = caretToDigitIndex(text, selectionEnd, format);

  let next: string;
  let newDigitIdx: number;
  if (startIdx !== endIdx) {
    next = digits.slice(0, startIdx) + digits.slice(endIdx);
    newDigitIdx = startIdx;
  } else if (startIdx >= digits.length) {
    return { text, selection: selectionStart };
  } else {
    next = digits.slice(0, startIdx) + digits.slice(startIdx + 1);
    newDigitIdx = startIdx;
  }

  const display = digitsToDisplay(next, format);
  return { text: display, selection: digitIndexToCaret(next, newDigitIdx, format) };
}

export function applyDelete(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: TimeInputFormat,
): SegmentEditResult {
  return withMssSign(format, text, selectionStart, selectionEnd, (t, s, e) =>
    applyDeleteCore(t, s, e, format),
  );
}

interface SegmentBounds {
  start: number;
  end: number;
  value: number;
  min: number;
  max: number;
}

function getSegmentAtCaret(text: string, caret: number, format: TimeInputFormat): SegmentBounds | null {
  if (format === 'hms') {
    const parts = text.split(':');
    if (parts.length < 3) return null;
    const segments = [
      { start: 0, end: 2, value: Number(parts[0]), min: 0, max: 23 },
      { start: 3, end: 5, value: Number(parts[1]), min: 0, max: 59 },
      { start: 6, end: 8, value: Number(parts[2]), min: 0, max: 59 },
    ];
    for (const seg of segments) {
      if (caret >= seg.start && caret <= seg.end + 1) return seg;
    }
    return segments[2] ?? null;
  }

  const sep = text.indexOf(':');
  if (sep < 0) {
    const minutes = Number(text) || 0;
    return { start: 0, end: text.length, value: minutes, min: 0, max: 99999 };
  }
  if (caret <= sep) {
    const minutes = Number(text.slice(0, sep)) || 0;
    return { start: 0, end: sep, value: minutes, min: 0, max: 99999 };
  }
  const seconds = Number(text.slice(sep + 1)) || 0;
  return { start: sep + 1, end: text.length, value: seconds, min: 0, max: 59 };
}

function replaceSegment(text: string, seg: SegmentBounds, newValue: number, format: TimeInputFormat): string {
  if (format === 'hms') {
    const parts = text.split(':');
    if (parts.length < 3) return text;
    const idx =
      seg.start === 0 ? 0 : seg.start === 3 ? 1 : 2;
    parts[idx] = String(newValue).padStart(2, '0');
    return parts.join(':');
  }

  const sep = text.indexOf(':');
  if (sep < 0) {
    return `${newValue}:00`;
  }
  if (seg.start === 0) {
    return `${newValue}:${text.slice(sep + 1).padStart(2, '0')}`;
  }
  return `${text.slice(0, sep)}:${String(newValue).padStart(2, '0')}`;
}

function adjustSegmentCore(
  text: string,
  caret: number,
  delta: number,
  format: TimeInputFormat,
): SegmentEditResult {
  const normalized = normalizeOnBlur(text, format);
  const seg = getSegmentAtCaret(normalized, caret, format);
  if (!seg || Number.isNaN(seg.value)) {
    return { text, selection: caret };
  }
  const nextValue = Math.min(seg.max, Math.max(seg.min, seg.value + delta));
  const newText = replaceSegment(normalized, seg, nextValue, format);
  return { text: newText, selection: caret };
}

export function adjustSegment(
  text: string,
  caret: number,
  delta: number,
  format: TimeInputFormat,
): SegmentEditResult {
  // Arrow keys adjust the unsigned magnitude; the sign is preserved (toggle with '-').
  if (format === 'mss' && text.startsWith('-')) {
    const r = adjustSegmentCore(text.slice(1), Math.max(0, caret - 1), delta, format);
    if (!r.text) return { text: '', selection: 0 };
    return { text: `-${r.text}`, selection: r.selection + 1 };
  }
  return adjustSegmentCore(text, caret, delta, format);
}
