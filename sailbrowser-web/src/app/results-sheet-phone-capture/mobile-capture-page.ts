import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { CaptureSessionUploadService } from './capture-session-upload.service';

type CapturePhase = 'idle' | 'uploading' | 'success' | 'error';

@Component({
  selector: 'app-mobile-capture-page',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="page">
      <mat-card appearance="outlined" class="card">
        <h2>ScoreSmarter Capture Results Sheet</h2>
        <input
          #fileInput
          type="file"
          accept="image/*"
          style="display: none;"
          (change)="onFileSelected($event, fileInput)"
        />

        @if (phase() === 'success') {
          <p class="success-msg">
            Successfully uploaded. Continue processing on desktop application.
          </p>
        } @else if (phase() === 'error') {
          @if (preview()) {
            <div class="preview">
              <img [src]="preview()" alt="Selected results sheet">
            </div>
          }
          <p class="error">{{ uploadError() }}</p>
          <button matButton="filled" class="full" type="button" (click)="retryUpload()">
            <mat-icon>refresh</mat-icon>
            Retry upload
          </button>
          <button matButton type="button" class="full" (click)="chooseDifferentPhoto(fileInput)">
            Choose different photo
          </button>
        } @else if (phase() === 'uploading') {
          @if (preview()) {
            <div class="preview">
              <img [src]="preview()" alt="Selected results sheet">
            </div>
          }
          <div class="upload-progress">
            <mat-progress-bar mode="indeterminate" />
            <p class="upload-label">Uploading results sheet</p>
          </div>
        } @else {
          <button matButton="filled" class="full" type="button" (click)="fileInput.click()">
            <mat-icon>photo_camera</mat-icon>
            Capture photo
          </button>
        }
      </mat-card>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .page { display: flex; justify-content: center; padding: 1rem; }
    .card { width: min(520px, 100%); display: grid; gap: 1rem; }
    .preview {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 0.25rem;
    }
    .preview img {
      width: 100%;
      border-radius: 6px;
      object-fit: contain;
      max-height: 45vh;
      display: block;
    }
    .upload-progress {
      display: grid;
      gap: 0.75rem;
    }
    .upload-label {
      margin: 0;
      text-align: center;
      font-weight: 600;
      font-size: 1rem;
      color: var(--mat-sys-on-surface);
    }
    .full { width: 100%; }
    .error { margin: 0; color: var(--mat-sys-error); }
    .success-msg {
      margin: 0;
      color: var(--mat-sys-primary);
      font-weight: 600;
      line-height: 1.45;
    }
  `],
})
export class MobileCapturePage {
  private readonly route = inject(ActivatedRoute);
  private readonly captureSessionUpload = inject(CaptureSessionUploadService);
  private readonly clubTenant = inject(ClubTenant);

  readonly clubId = this.clubTenant.clubId;
  readonly sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
  readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly phase = signal<CapturePhase>('idle');
  readonly imageBase64 = signal<string | null>(null);
  readonly imageMimeType = signal<string>('image/jpeg');
  readonly preview = signal<string | null>(null);
  readonly uploadError = signal<string | null>(null);

  onFileSelected(event: Event, fileInput: HTMLInputElement): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadError.set(null);
    this.imageMimeType.set(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      this.preview.set(result);
      this.imageBase64.set(result.split(',')[1] ?? null);
      void this.runUpload();
    };
    reader.onerror = () => {
      this.uploadError.set('Could not read the image file.');
      this.phase.set('error');
    };
    reader.readAsDataURL(file);
  }

  async retryUpload(): Promise<void> {
    await this.runUpload();
  }

  chooseDifferentPhoto(fileInput: HTMLInputElement): void {
    fileInput.value = '';
    this.preview.set(null);
    this.imageBase64.set(null);
    this.uploadError.set(null);
    this.phase.set('idle');
  }

  private async runUpload(): Promise<void> {
    if (!this.imageBase64()) return;
    this.phase.set('uploading');
    this.uploadError.set(null);
    try {
      const res = await this.captureSessionUpload.uploadFromCaptureSession({
        clubId: this.clubId,
        sessionId: this.sessionId,
        token: this.token,
        imageBase64: this.imageBase64()!,
        imageMimeType: this.imageMimeType(),
      });
      if (res.status === 'uploaded') {
        this.phase.set('success');
      } else {
        this.uploadError.set(`Upload did not complete (status: ${res.status}).`);
        this.phase.set('error');
      }
    } catch (e: unknown) {
      this.uploadError.set(e instanceof Error ? e.message : 'Upload failed');
      this.phase.set('error');
    }
  }
}
