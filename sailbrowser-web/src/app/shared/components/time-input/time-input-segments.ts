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
  if (d.length === 3) return `${d.slice(0, -1)}:${d.slice(-1)}`;
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
  return digitsToDisplay(digits.slice(0, digitIndex), format).length;
}

export function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatSegments(date: Date, anchorDate: Date, format: TimeInputFormat): string {
  if (format === 'hms') {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  const anchor = localMidnight(anchorDate);
  const elapsedSec = Math.max(0, Math.round((date.getTime() - anchor.getTime()) / 1000));
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function normalizeOnBlur(text: string, format: TimeInputFormat): string {
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
  if (digits.length === 3) {
    return `${digits.slice(0, -1)}:${digits.slice(-1).padStart(2, '0')}`;
  }
  return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
}

function parseHmsSegments(text: string, anchorDate: Date): Date | null {
  const match = /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(text.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  return new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate(),
    hours,
    minutes,
    seconds,
    0,
  );
}

function parseMssSegments(text: string, anchorDate: Date): Date | null {
  const match = /^(\d+):(\d{1,2})$/.exec(text.trim());
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds > 59) return null;

  const anchor = localMidnight(anchorDate);
  return new Date(anchor.getTime() + minutes * 60_000 + seconds * 1_000);
}

export function parseSegments(text: string, anchorDate: Date, format: TimeInputFormat): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return format === 'hms' ? parseHmsSegments(trimmed, anchorDate) : parseMssSegments(trimmed, anchorDate);
}

export function isCompleteDisplay(text: string, format: TimeInputFormat): boolean {
  if (format === 'hms') {
    return /^\d{2}:\d{2}:\d{2}$/.test(text);
  }
  return /^\d+:\d{2}$/.test(text);
}

export function applyDigitInput(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  digit: string,
  format: TimeInputFormat,
): SegmentEditResult | null {
  if (!/^\d$/.test(digit)) return null;

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

export function applyBackspace(
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

export function applyDelete(
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

export function adjustSegment(
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
