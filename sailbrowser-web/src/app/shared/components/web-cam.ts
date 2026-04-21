
import { Component, ElementRef, viewChild, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-webcam',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSnackBarModule,
    MatDividerModule
  ],
  template: `
    <mat-card class="webcam-card">
      <mat-card-header>
         <mat-card-title>Camera Feed</mat-card-title>
         <mat-card-subtitle>Point and click to capture</mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
         <div class="video-container">
            <video #videoElement autoplay playsinline></video>

            <button mat-fab color="primary" class="capture-btn" (click)="capture()" [disabled]="isUploading()">
            <mat-icon>photo_camera</mat-icon>
            </button>
         </div>

         <canvas #canvasElement style="display: none;"></canvas>

         @if (capturedImage()) {
            <mat-divider></mat-divider>
            <div class="preview-section">
            <h3>Preview</h3>
            <img [src]="capturedImage()" class="img-preview" />
            </div>
         }
      </mat-card-content>
      </mat-card>
   `,
  styles: [`
      .webcam-card {
         max-width: 700px;
         margin: 2rem auto;
         padding: 16px;
      }

      .video-container {
         position: relative;
         width: 100 %;
         background: #000;
         border-radius: 8px;
         overflow: hidden;
         line-height: 0; /* Removes bottom gap in video */
      }

      video {
         width: 100 %;
         height: auto;
         transform: scaleX(-1); /* Natural mirroring */
      }

      .capture-btn {
         position: absolute;
         bottom: 20px;
         left: 50 %;
         transform: translateX(-50 %);
         z-index: 10;
      }

      .preview-section {
         margin-top: 20px;
         text-align: center;
      }

      .img-preview {
         width: 100 %;
         max-width: 300px;
         border-radius: 4px;
         border: 1px solid #ccc;
         transform: scaleX(-1); /* Match the mirrored video */
      }

      mat-divider {
         margin: 20px 0;
      }
   `]
})
export class Webcam implements OnInit, OnDestroy {
  videoElement = viewChild.required<ElementRef<HTMLVideoElement>>('videoElement');
  canvasElement = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasElement');

  capturedImage = signal<string | null>(null);
  isUploading = signal<boolean>(false);
  private stream: MediaStream | null = null;

  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);

  async ngOnInit() {
    await this.setupCamera();
  }

  async setupCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false
      });
      this.videoElement().nativeElement.srcObject = this.stream;
    } catch (err) {
      this.snackBar.open('Could not access webcam', 'Close', { duration: 3000 });
    }
  }

  capture() {
    const video = this.videoElement().nativeElement;
    const canvas = this.canvasElement().nativeElement;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);

      const dataUrl = canvas.toDataURL('image/png');
      this.capturedImage.set(dataUrl);

      canvas.toBlob((blob) => {
        if (blob) this.uploadToServer(blob);
      }, 'image/png');
    }
  }

  private uploadToServer(blob: Blob) {
    this.isUploading.set(true);
    const formData = new FormData();
    formData.append('file', blob, `capture.png`);

    this.http.post('https://your-api.com/upload', formData).subscribe({
      next: () => {
        this.snackBar.open('Photo uploaded successfully!', 'Done', { duration: 2000 });
        this.isUploading.set(false);
      },
      error: () => {
        this.snackBar.open('Upload failed', 'Retry', { duration: 3000 });
        this.isUploading.set(false);
      }
    });
  }

  ngOnDestroy() {
    this.stream?.getTracks().forEach(track => track.stop());
  }
}