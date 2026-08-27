import type { CaptureImage } from './capture-image.model';
import {
  imageTargetSize,
  resizeDataUrlToJpeg,
  resizeImageToJpeg,
  type ResizedJpegImage,
} from 'app/shared/utils/resize-image';

/** Long-edge cap for results-sheet images (storage, upload, and Gemini). */
export const SCAN_IMAGE_MAX_LONG_EDGE = 2048;

/** JPEG quality used when re-encoding scan images. */
export const SCAN_IMAGE_JPEG_QUALITY = 0.8;

export type ScanJpegImage = ResizedJpegImage;

const scanOptions = {
  maxLongEdge: SCAN_IMAGE_MAX_LONG_EDGE,
  quality: SCAN_IMAGE_JPEG_QUALITY,
} as const;

/**
 * Compute output dimensions: never upscale; shrink so max(w,h) <= maxLongEdge.
 * @deprecated Prefer {@link imageTargetSize} from `app/shared/utils/resize-image`.
 */
export function scanImageTargetSize(
  width: number,
  height: number,
  maxLongEdge: number = SCAN_IMAGE_MAX_LONG_EDGE,
): { width: number; height: number } {
  return imageTargetSize(width, height, maxLongEdge);
}

/** Resize/re-encode a File to scan JPEG. Applies EXIF orientation when the browser supports it. */
export async function resizeFileToScanJpeg(file: File): Promise<ScanJpegImage> {
  return resizeImageToJpeg(file, scanOptions);
}

/** Resize/re-encode a data URL (e.g. webcam capture) to scan JPEG. */
export async function resizeDataUrlToScanJpeg(dataUrl: string): Promise<ScanJpegImage> {
  return resizeDataUrlToJpeg(dataUrl, scanOptions);
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
