/** Long-edge resize + JPEG re-encode for browser uploads (scan sheets, club logos, etc.). */

export interface ResizeImageToJpegOptions {
  /** Never upscale; shrink so max(width, height) <= this. */
  maxLongEdge: number;
  /** `canvas.toBlob` JPEG quality (0–1). */
  quality: number;
}

export interface ResizedJpegImage {
  base64: string;
  mimeType: 'image/jpeg';
  previewUrl: string;
  width: number;
  height: number;
}

/**
 * Compute output dimensions: never upscale; shrink so max(w,h) <= maxLongEdge.
 */
export function imageTargetSize(
  width: number,
  height: number,
  maxLongEdge: number,
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

/** Resize/re-encode a File or Blob to JPEG. Applies EXIF orientation when supported. */
export async function resizeImageToJpeg(
  source: Blob,
  options: ResizeImageToJpegOptions,
): Promise<ResizedJpegImage> {
  const bitmap = await createOrientedBitmap(source);
  try {
    return await bitmapToJpeg(bitmap, options);
  } finally {
    bitmap.close();
  }
}

/** Resize/re-encode a data URL (e.g. webcam capture) to JPEG. */
export async function resizeDataUrlToJpeg(
  dataUrl: string,
  options: ResizeImageToJpegOptions,
): Promise<ResizedJpegImage> {
  const blob = await (await fetch(dataUrl)).blob();
  return resizeImageToJpeg(blob, options);
}

async function createOrientedBitmap(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers may not accept imageOrientation; default decode still often honours EXIF.
    return await createImageBitmap(source);
  }
}

async function bitmapToJpeg(
  bitmap: ImageBitmap,
  options: ResizeImageToJpegOptions,
): Promise<ResizedJpegImage> {
  const { width, height } = imageTargetSize(bitmap.width, bitmap.height, options.maxLongEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create canvas context for image resize.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvasToJpegBlob(canvas, options.quality);
  const previewUrl = await blobToDataUrl(blob);
  const base64 = previewUrl.split(',')[1] ?? '';
  if (!base64) {
    throw new Error('Failed to encode image as JPEG.');
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
