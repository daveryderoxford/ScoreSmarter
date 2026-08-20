import type { CaptureImage } from './capture-image.model';

/** Long-edge cap for results-sheet images (storage, upload, and Gemini). */
export const SCAN_IMAGE_MAX_LONG_EDGE = 2048;

/** JPEG quality used when re-encoding scan images. */
export const SCAN_IMAGE_JPEG_QUALITY = 0.8;

export interface ScanJpegImage {
  base64: string;
  mimeType: 'image/jpeg';
  previewUrl: string;
  width: number;
  height: number;
}

/**
 * Compute output dimensions: never upscale; shrink so max(w,h) <= maxLongEdge.
 */
export function scanImageTargetSize(
  width: number,
  height: number,
  maxLongEdge: number = SCAN_IMAGE_MAX_LONG_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions must be positive.');
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height };
  }
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Resize/re-encode a File to scan JPEG. Applies EXIF orientation when the browser supports it. */
export async function resizeFileToScanJpeg(file: File): Promise<ScanJpegImage> {
  const bitmap = await createOrientedBitmap(file);
  try {
    return await bitmapToScanJpeg(bitmap);
  } finally {
    bitmap.close();
  }
}

/** Resize/re-encode a data URL (e.g. webcam capture) to scan JPEG. */
export async function resizeDataUrlToScanJpeg(dataUrl: string): Promise<ScanJpegImage> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createOrientedBitmap(blob);
  try {
    return await bitmapToScanJpeg(bitmap);
  } finally {
    bitmap.close();
  }
}

/**
 * Normalize any capture source into an inline {@link CaptureImage} ready for upload/scan.
 */
export async function toScanInlineCapture(source: File | string): Promise<CaptureImage & { kind: 'inline' }> {
  const jpeg =
    typeof source === 'string'
      ? await resizeDataUrlToScanJpeg(source)
      : await resizeFileToScanJpeg(source);
  return {
    kind: 'inline',
    base64: jpeg.base64,
    mimeType: jpeg.mimeType,
    previewUrl: jpeg.previewUrl,
  };
}

async function createOrientedBitmap(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers may not accept imageOrientation; default decode still often honours EXIF.
    return await createImageBitmap(source);
  }
}

async function bitmapToScanJpeg(bitmap: ImageBitmap): Promise<ScanJpegImage> {
  const { width, height } = scanImageTargetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create canvas context for image resize.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvasToJpegBlob(canvas, SCAN_IMAGE_JPEG_QUALITY);
  const previewUrl = await blobToDataUrl(blob);
  const base64 = previewUrl.split(',')[1] ?? '';
  if (!base64) {
    throw new Error('Failed to encode scan image as JPEG.');
  }
  return {
    base64,
    mimeType: 'image/jpeg',
    previewUrl,
    width,
    height,
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null.'));
      },
      'image/jpeg',
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read JPEG blob.'));
    reader.readAsDataURL(blob);
  });
}
