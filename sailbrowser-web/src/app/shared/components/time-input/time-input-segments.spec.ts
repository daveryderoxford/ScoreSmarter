import { describe, expect, it } from 'vitest';
import {
  applyBackspace,
  applyDigitInput,
  digitsToDisplay,
  displayToSeconds,
  isCompleteDisplay,
  normalizeOnBlur,
  secondsToDisplay,
  toggleMssSign,
} from './time-input-segments';

describe('digitsToDisplay', () => {
  it('formats hms digit stream with auto-colons', () => {
    expect(digitsToDisplay('1', 'hms')).toBe('1');
    expect(digitsToDisplay('12', 'hms')).toBe('12');
    expect(digitsToDisplay('123', 'hms')).toBe('12:3');
    expect(digitsToDisplay('1234', 'hms')).toBe('12:34');
    expect(digitsToDisplay('12345', 'hms')).toBe('12:34:5');
    expect(digitsToDisplay('123456', 'hms')).toBe('12:34:56');
  });

  it('formats mss digit stream with right-filled seconds', () => {
    expect(digitsToDisplay('2', 'mss')).toBe('2');
    expect(digitsToDisplay('23', 'mss')).toBe('23');
    expect(digitsToDisplay('234', 'mss')).toBe('2:34');
    expect(digitsToDisplay('2345', 'mss')).toBe('23:45');
    expect(digitsToDisplay('12345', 'mss')).toBe('123:45');
    expect(digitsToDisplay('530', 'mss')).toBe('5:30');
    expect(digitsToDisplay('500', 'mss')).toBe('5:00');
  });

  it('keeps rendered mss values stable under re-masking', () => {
    // A rendered value must be a fixed point of the editing mask, otherwise
    // the first edit shifts the minutes (the "5 becomes 50" bug).
    const display = secondsToDisplay(300, 'mss');
    expect(display).toBe('5:00');
    expect(digitsToDisplay('500', 'mss')).toBe(display);
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

describe('displayToSeconds and secondsToDisplay', () => {
  it('round-trips hms as seconds-of-day', () => {
    const seconds = displayToSeconds('14:32:05', 'hms');
    expect(seconds).toBe(14 * 3600 + 32 * 60 + 5);
    expect(secondsToDisplay(seconds!, 'hms')).toBe('14:32:05');
  });

  it('rejects invalid hms ranges', () => {
    expect(displayToSeconds('99:99:99', 'hms')).toBeNull();
  });

  it('round-trips mss as total elapsed seconds', () => {
    const seconds = displayToSeconds('123:45', 'mss');
    expect(seconds).toBe(123 * 60 + 45);
    expect(secondsToDisplay(seconds!, 'mss')).toBe('123:45');
  });

  it('supports minutes over 60 in mss', () => {
    const seconds = displayToSeconds('83:30', 'mss');
    expect(seconds).toBe(83 * 60 + 30);
    expect(secondsToDisplay(seconds!, 'mss')).toBe('83:30');
  });

  it('rejects invalid mss seconds', () => {
    expect(displayToSeconds('12:99', 'mss')).toBeNull();
  });
});

describe('negative mss support', () => {
  it('renders negative seconds with a leading minus', () => {
    expect(secondsToDisplay(-90, 'mss')).toBe('-1:30');
    expect(secondsToDisplay(-30, 'mss')).toBe('-0:30');
  });

  it('parses a leading minus to negative seconds', () => {
    expect(displayToSeconds('-1:30', 'mss')).toBe(-90);
    expect(displayToSeconds('-0:30', 'mss')).toBe(-30);
  });

  it('round-trips negative mss values', () => {
    for (const seconds of [-30, -90, -3630]) {
      expect(displayToSeconds(secondsToDisplay(seconds, 'mss'), 'mss')).toBe(seconds);
    }
  });

  it('treats a signed mss value as complete', () => {
    expect(isCompleteDisplay('-1:30', 'mss')).toBe(true);
    expect(isCompleteDisplay('1:30', 'mss')).toBe(true);
  });

  it('hms never emits a sign and ignores negative input', () => {
    expect(secondsToDisplay(-90, 'hms')).toBe('00:00:00');
    expect(displayToSeconds('-1:02:03', 'hms')).toBeNull();
    expect(isCompleteDisplay('-1:02:03', 'hms')).toBe(false);
  });

  it('preserves the sign while editing digits', () => {
    // Unsigned reference: type the magnitude with no sign.
    let unsigned = '';
    let us = 0;
    for (const d of '130') {
      const r = applyDigitInput(unsigned, us, us, d, 'mss')!;
      unsigned = r.text;
      us = r.selection;
    }
    // Signed: toggle the sign, then type the same digits.
    const toggled = toggleMssSign('', 0);
    expect(toggled.text).toBe('-');
    let text = toggled.text;
    let sel = toggled.selection;
    for (const d of '130') {
      const r = applyDigitInput(text, sel, sel, d, 'mss')!;
      text = r.text;
      sel = r.selection;
    }
    expect(text).toBe(`-${unsigned}`);
  });

  it('drops the sign once the last digit is removed', () => {
    const afterDigit = applyDigitInput('-', 1, 1, '5', 'mss')!;
    expect(afterDigit.text).toBe('-5');
    const afterBackspace = applyBackspace(afterDigit.text, afterDigit.selection, afterDigit.selection, 'mss');
    expect(afterBackspace.text).toBe('');
  });
});

describe('normalizeOnBlur', () => {
  it('zero-pads partial hms', () => {
    expect(normalizeOnBlur('9', 'hms')).toBe('09:00:00');
    expect(normalizeOnBlur('14:3', 'hms')).toBe('14:30:00');
  });

  it('right-fills partial mss', () => {
    expect(normalizeOnBlur('23', 'mss')).toBe('23:00');
    expect(normalizeOnBlur('234', 'mss')).toBe('2:34');
    expect(normalizeOnBlur('530', 'mss')).toBe('5:30');
  });

  it('right-fills partial negative mss preserving the sign', () => {
    expect(normalizeOnBlur('-23', 'mss')).toBe('-23:00');
    expect(normalizeOnBlur('-234', 'mss')).toBe('-2:34');
  });
});
