import { describe, expect, it } from 'vitest';
import { scannerContextAiFields } from './scan-run.store';

describe('scannerContextAiFields', () => {
  it('omits model and thinking for non-admin callers', () => {
    expect(scannerContextAiFields(false, 'gemini-3.1-pro-preview', 'high')).toEqual({});
  });

  it('includes a sys-admin per-scan override', () => {
    expect(scannerContextAiFields(true, 'gemini-3.1-pro-preview', 'high')).toEqual({
      model: 'gemini-3.1-pro-preview',
      thinkingLevel: 'high',
    });
  });

  it('omits empty model so the server uses the system default', () => {
    expect(scannerContextAiFields(true, '  ', '')).toEqual({});
  });
});
