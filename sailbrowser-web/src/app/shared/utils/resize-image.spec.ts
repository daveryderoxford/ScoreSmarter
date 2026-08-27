import { describe, expect, it } from 'vitest';
import { imageTargetSize, resizeImageToJpeg } from './resize-image';

describe('imageTargetSize', () => {
  it('shrinks landscape so long edge is the max', () => {
    expect(imageTargetSize(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  it('shrinks portrait so long edge is the max', () => {
    expect(imageTargetSize(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('does not upscale images already under the cap', () => {
    expect(imageTargetSize(1200, 800, 2048)).toEqual({ width: 1200, height: 800 });
  });

  it('leaves exact max long-edge unchanged', () => {
    expect(imageTargetSize(512, 100, 512)).toEqual({ width: 512, height: 100 });
  });

  it('rejects non-positive dimensions', () => {
    expect(() => imageTargetSize(0, 100, 512)).toThrow();
  });
});

describe('resizeImageToJpeg', () => {
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
    return new File([bytes], 'image.png', { type: 'image/png' });
  }

  it('re-encodes oversized images under the long-edge cap', async () => {
    if (typeof createImageBitmap !== 'function') {
      return;
    }
    const file = makeTestPngFile(3000, 2000);
    const jpeg = await resizeImageToJpeg(file, { maxLongEdge: 512, quality: 0.8 });
    expect(jpeg.mimeType).toBe('image/jpeg');
    expect(jpeg.previewUrl.startsWith('data:image/jpeg')).toBe(true);
    expect(Math.max(jpeg.width, jpeg.height)).toBe(512);
  });
});
