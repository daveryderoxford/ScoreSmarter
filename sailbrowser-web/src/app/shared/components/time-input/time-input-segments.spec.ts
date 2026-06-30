import { describe, expect, it } from 'vitest';
import {
  applyBackspace,
  applyDigitInput,
  digitsToDisplay,
  formatSegments,
  localMidnight,
  normalizeOnBlur,
  parseSegments,
} from './time-input-segments';

const anchor = new Date(2026, 5, 15);

describe('digitsToDisplay', () => {
  it('formats hms digit stream with auto-colons', () => {
    expect(digitsToDisplay('1', 'hms')).toBe('1');
    expect(digitsToDisplay('12', 'hms')).toBe('12');
    expect(digitsToDisplay('123', 'hms')).toBe('12:3');
    expect(digitsToDisplay('1234', 'hms')).toBe('12:34');
    expect(digitsToDisplay('12345', 'hms')).toBe('12:34:5');
    expect(digitsToDisplay('123456', 'hms')).toBe('12:34:56');
  });

  it('formats mss digit stream with auto-colon', () => {
    expect(digitsToDisplay('2', 'mss')).toBe('2');
    expect(digitsToDisplay('23', 'mss')).toBe('23');
    expect(digitsToDisplay('234', 'mss')).toBe('23:4');
    expect(digitsToDisplay('2345', 'mss')).toBe('23:45');
    expect(digitsToDisplay('12345', 'mss')).toBe('123:45');
  });
});

describe('applyDigitInput', () => {
  it('appends digits sequentially for hms', () => {
    let text = '';
    let sel = 0;
    for (const d of '143205') {
      const r = applyDigitInput(text, sel, sel, d, 'hms')!;
      text = r.text;
      sel = r.selection;
    }
    expect(text).toBe('14:32:05');
  });

  it('appends digits sequentially for mss', () => {
    let text = '';
    let sel = 0;
    for (const d of '12345') {
      const r = applyDigitInput(text, sel, sel, d, 'mss')!;
      text = r.text;
      sel = r.selection;
    }
    expect(text).toBe('123:45');
  });
});

describe('applyBackspace', () => {
  it('removes digits across colon boundaries', () => {
    const r = applyBackspace('12:34:56', 8, 8, 'hms');
    expect(r.text).toBe('12:34:5');
  });
});

describe('parseSegments and formatSegments', () => {
  it('round-trips hms on anchor calendar day', () => {
    const parsed = parseSegments('14:32:05', anchor, 'hms');
    expect(parsed).not.toBeNull();
    expect(parsed!.getHours()).toBe(14);
    expect(parsed!.getMinutes()).toBe(32);
    expect(parsed!.getSeconds()).toBe(5);
    expect(parsed!.getFullYear()).toBe(anchor.getFullYear());
    expect(formatSegments(parsed!, anchor, 'hms')).toBe('14:32:05');
  });

  it('rejects invalid hms ranges', () => {
    expect(parseSegments('99:99:99', anchor, 'hms')).toBeNull();
  });

  it('round-trips mss from midnight offset', () => {
    const parsed = parseSegments('123:45', anchor, 'mss');
    expect(parsed).not.toBeNull();
    const midnight = localMidnight(anchor);
    expect(parsed!.getTime() - midnight.getTime()).toBe((123 * 60 + 45) * 1000);
    expect(formatSegments(parsed!, anchor, 'mss')).toBe('123:45');
  });

  it('supports minutes over 60 in mss', () => {
    const parsed = parseSegments('83:30', anchor, 'mss');
    expect(parsed).not.toBeNull();
    expect(formatSegments(parsed!, anchor, 'mss')).toBe('83:30');
  });

  it('rejects invalid mss seconds', () => {
    expect(parseSegments('12:99', anchor, 'mss')).toBeNull();
  });
});

describe('normalizeOnBlur', () => {
  it('zero-pads partial hms', () => {
    expect(normalizeOnBlur('9', 'hms')).toBe('09:00:00');
    expect(normalizeOnBlur('14:3', 'hms')).toBe('14:30:00');
  });

  it('zero-pads partial mss', () => {
    expect(normalizeOnBlur('23', 'mss')).toBe('23:00');
    expect(normalizeOnBlur('234', 'mss')).toBe('23:04');
  });
});
