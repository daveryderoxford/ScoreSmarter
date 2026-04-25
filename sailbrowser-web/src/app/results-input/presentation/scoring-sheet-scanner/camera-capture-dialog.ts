import { AfterViewInit, Component, ElementRef, OnDestroy, signal, viewChild, output, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-camera-capture-dialog',
  imports: [MatButtonModule, MatIconModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Capture Scoring Sheet</h2>
    <mat-dialog-content>
      <div class="video-container">
        @if (!hasCaptured()) {
          <video #videoElement autoplay playsinline></video>
        } @else {
          <img [src]="capturedImage()" class="captured-preview" alt="Captured sheet preview">
        }
      </div>
      @if (errorMsg()) {
        <div class="error-banner">{{ errorMsg() }}</div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (!hasCaptured()) {
        <button matButton (click)="cancel()">Cancel</button>
        <button matButton="filled" [disabled]="!isStreamReady()" (click)="capture()">
          <mat-icon>camera</mat-icon> Snap Photo
        </button>
      } @else {
        <button matButton (click)="retake()">Retake</button>
        <button matButton="filled" (click)="confirm()">Keep Photo</button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .video-container {
      position: relative;
      background: #000;
      width: 100%;
      min-height: 300px;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      border-radius: 8px;
    }
    video, .captured-preview {
      max-width: 100%;
      max-height: 60vh;
      object-fit: contain;
    }
    .error-banner {
      color: #ef4444;
      background: #fee2e2;
      padding: 0.75rem;
      border-radius: 4px;
      margin-top: 1rem;
      font-size: 0.875rem;
    }
  `]
})
export class CameraCaptureDialog implements AfterViewInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<CameraCaptureDialog>);
  
  videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');
  
  hasCaptured = signal(false);
  isStreamReady = signal(false);
  capturedImage = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  private stream: MediaStream | null = null;
  private canvas = document.createElement('canvas');

  async ngAfterViewInit() {
    await this.startCamera();
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async startCamera() {
    this.errorMsg.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      const videoNode = this.videoElement();
      if (videoNode && this.stream) {
        videoNode.nativeElement.srcObject = this.stream;
        videoNode.nativeElement.onloadedmetadata = () => {
          this.isStreamReady.set(true);
        };
      }
    } catch (e: any) {
      this.errorMsg.set('Unable to access camera: ' + e.message);
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isStreamReady.set(false);
  }

  capture() {
    const videoNode = this.videoElement()?.nativeElement;
    if (!videoNode) return;

    this.canvas.width = videoNode.videoWidth;
    this.canvas.height = videoNode.videoHeight;
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoNode, 0, 0, this.canvas.width, this.canvas.height);
      const dataUrl = this.canvas.toDataURL('image/jpeg', 0.9);
      this.capturedImage.set(dataUrl);
      this.hasCaptured.set(true);
      this.stopCamera();
    }
  }

  async retake() {
    this.hasCaptured.set(false);
    this.capturedImage.set(null);
    await this.startCamera();
  }

  confirm() {
    const dataUrl = this.capturedImage();
    if (dataUrl) {
      const base64 = dataUrl.split(',')[1];
      this.dialogRef.close({
        preview: dataUrl,
        base64: base64
      });
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }
}

