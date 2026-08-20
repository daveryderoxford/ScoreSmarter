import {
  SCAN_IMAGE_MAX_LONG_EDGE,
  scanImageTargetSize,
  toScanInlineCapture,
} from './resize-scan-image';

describe('scanImageTargetSize', () => {
  it('shrinks landscape so long edge is the max', () => {
    expect(scanImageTargetSize(4000, 3000)).toEqual({ width: 2048, height: 1536 });
  });

  it('shrinks portrait so long edge is the max', () => {
    expect(scanImageTargetSize(3000, 4000)).toEqual({ width: 1536, height: 2048 });
  });

  it('does not upscale images already under the cap', () => {
    expect(scanImageTargetSize(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('leaves exact max long-edge unchanged', () => {
    expect(scanImageTargetSize(SCAN_IMAGE_MAX_LONG_EDGE, 1000)).toEqual({
      width: SCAN_IMAGE_MAX_LONG_EDGE,
      height: 1000,
    });
  });

  it('rejects non-positive dimensions', () => {
    expect(() => scanImageTargetSize(0, 100)).toThrow();
  });
});

describe('toScanInlineCapture', () => {
  function makeTestPngFile(width: number, height: number): File {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    const binary = atob(dataUrl.split(',')[1]!);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], 'sheet.png', { type: 'image/png' });
  }

  it('re-encodes oversized images as jpeg under the long-edge cap', async () => {
    if (typeof createImageBitmap !== 'function') {
      return;
    }
    const file = makeTestPngFile(3000, 2000);
    const inline = await toScanInlineCapture(file);
    expect(inline.kind).toBe('inline');
    expect(inline.mimeType).toBe('image/jpeg');
    expect(inline.previewUrl.startsWith('data:image/jpeg')).toBe(true);
    expect(inline.base64.length).toBeGreaterThan(0);

    const bitmap = await createImageBitmap(
      await (await fetch(inline.previewUrl)).blob(),
    );
    try {
      expect(Math.max(bitmap.width, bitmap.height)).toBe(SCAN_IMAGE_MAX_LONG_EDGE);
    } finally {
      bitmap.close();
    }
  });

  it('keeps small image dimensions while forcing jpeg mime', async () => {
    if (typeof createImageBitmap !== 'function') {
      return;
    }
    const file = makeTestPngFile(640, 480);
    const inline = await toScanInlineCapture(file);
    expect(inline.mimeType).toBe('image/jpeg');
    const bitmap = await createImageBitmap(
      await (await fetch(inline.previewUrl)).blob(),
    );
    try {
      expect(bitmap.width).toBe(640);
      expect(bitmap.height).toBe(480);
    } finally {
      bitmap.close();
    }
  });
});
