import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface WebcamCapture {
  /** JPEG/PNG blob suitable for upload. */
  blob: Blob;
  /** MIME type matching `blob`. */
  mimeType: string;
  /** Data URL of the same bitmap for in-page preview. */
  dataUrl: string;
  /** Source image width in pixels. */
  width: number;
  /** Source image height in pixels. */
  height: number;
}

/**
 * Minimal live-camera component: requests `getUserMedia`, shows a preview,
 * and emits a captured frame (Blob + preview data URL) via `captured`.
 *
 * Notes:
 * - The preview video may be mirrored via CSS (`scaleX(-1)`) when using the
 *   user-facing camera, but the emitted bitmap is always unmirrored so OCR
 *   models receive text in the correct reading order.
 * - Defaults to `facingMode: 'environment'` (rear camera on mobile) which is
 *   what you want for photographing a results sheet.
 */
@Component({
  selector: 'app-webcam',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="webcam">
      <div class="video-container" [class.mirrored]="mirrorPreview()">
        <video #videoEl autoplay playsinline muted></video>

        <button
          mat-fab
          class="capture-btn"
          type="button"
          [disabled]="!ready()"
          (click)="capture()"
          aria-label="Capture photo"
        >
          <mat-icon>photo_camera</mat-icon>
        </button>
      </div>

      <canvas #canvasEl style="display: none;"></canvas>

      @if (!ready() && errorMessage()) {
        <p class="status error">{{ errorMessage() }}</p>
      } @else if (!ready()) {
        <p class="status">Starting camera…</p>
      }
    </div>
  `,
  styles: [`
    .webcam {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .video-container {
      position: relative;
      width: 100%;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      line-height: 0;
    }
    video {
      width: 100%;
      height: auto;
      display: block;
    }
    .video-container.mirrored video {
      transform: scaleX(-1);
    }
    .capture-btn {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
    }
    .status {
      margin: 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }
    .status.error {
      color: var(--mat-sys-error);
    }
  `],
})
export class Webcam implements OnInit, OnDestroy {
  /** Preferred camera: 'environment' is the rear camera; 'user' is the front camera. */
  readonly facingMode = input<'environment' | 'user'>('environment');
  /** Output MIME type for captured image. */
  readonly mimeType = input<'image/jpeg' | 'image/png'>('image/jpeg');
  /** JPEG quality in [0,1]; ignored for PNG. */
  readonly quality = input<number>(0.92);
  /** Mirror the preview (useful for selfie/user camera). Capture is never mirrored. */
  readonly mirrorPreview = input<boolean>(false);

  /** Emits once per successful capture. */
  readonly captured = output<WebcamCapture>();

  private readonly videoEl = viewChild.required<ElementRef<HTMLVideoElement>>('videoEl');
  private readonly canvasEl = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasEl');
  private readonly snackBar = inject(MatSnackBar);

  readonly ready = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private stream: MediaStream | null = null;

  async ngOnInit(): Promise<void> {
    await this.start();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.errorMessage.set('Camera API not supported in this browser.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.facingMode() },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      const video = this.videoEl().nativeElement;
      video.srcObject = this.stream;
      await video.play().catch(() => undefined);
      this.ready.set(true);
      this.errorMessage.set(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access camera';
      this.errorMessage.set(message);
      this.snackBar.open(`Camera error: ${message}`, 'Close', { duration: 4000 });
    }
  }

  private stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  capture(): void {
    const video = this.videoEl().nativeElement;
    const canvas = this.canvasEl().nativeElement;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    const mimeType = this.mimeType();
    const dataUrl = canvas.toDataURL(mimeType, this.quality());
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        this.captured.emit({ blob, mimeType, dataUrl, width, height });
      },
      mimeType,
      this.quality(),
    );
  }
}
