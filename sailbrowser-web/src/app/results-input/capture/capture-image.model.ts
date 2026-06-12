/** Image selected for scanning (storage path or inline bytes + optional UI preview). */
export type CaptureImage =
  | { kind: 'storagePath'; path: string; previewUrl?: string | null }
  | { kind: 'inline'; base64: string; mimeType: string; previewUrl: string };

export function isCaptureReady(img: CaptureImage | null): boolean {
  if (!img) return false;
  if (img.kind === 'storagePath') return !!img.path;
  return !!img.base64 && !!img.mimeType;
}

export function capturePreviewUrl(img: CaptureImage | null): string | null {
  if (!img) return null;
  return img.previewUrl ?? null;
}

/**
 * Source-agnostic signal that a fresh image was just acquired.
 * `autoAdvance` is true when the image was already reviewed at the source (e.g.
 * a phone capture), so the container may advance the stepper without the user
 * re-reviewing it.
 */
export interface AcquisitionEvent {
  at: number;
  autoAdvance: boolean;
}

/** Minimal render contract for the capture preview. */
export interface CapturePreview {
  src: string | null;
  loading: boolean;
  error: string | null;
}
