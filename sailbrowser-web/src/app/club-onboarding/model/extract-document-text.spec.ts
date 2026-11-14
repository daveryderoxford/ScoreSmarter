import { describe, expect, it } from 'vitest';
import { decodeHtml, savedPageAddress } from './extract-document-text';

describe('saved results pages', () => {
  it('finds the address a page was saved from', () => {
    expect(savedPageAddress('<!-- saved from url=(0043)https://northamptonsailingclub.org/results/ --><html>'))
      .toBe('https://northamptonsailingclub.org/results/');
    expect(savedPageAddress('<link rel="canonical" href="https://northamptonsailingclub.org/results/" />'))
      .toBe('https://northamptonsailingclub.org/results/');
    expect(savedPageAddress('<html><body>No address</body></html>')).toBeNull();
  });

  it('decodes a Sailwave page by its ISO-8859-1 meta tag', () => {
    const html = '<meta http-equiv="Content-Type" content="text/html;charset=ISO-8859-1"/><th>\x96WS01</th>';
    const bytes = Uint8Array.from(html, character => character.charCodeAt(0));
    expect(decodeHtml(bytes.buffer)).toContain('\u2013WS01');
  });
});
