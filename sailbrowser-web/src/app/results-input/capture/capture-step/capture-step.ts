import { Component, input, output, resource } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ImageViewerComponent } from 'app/shared/components/image-viewer';
import { MobilePhotoPicker } from '../mobile-photo-picker';

export type CaptureStepMode = 'stored' | 'newPreview' | 'empty';

/** Parent-derived UI state for the capture card. */
export interface CaptureStepViewModel {
  mode: CaptureStepMode;
  isMobile: boolean;
  previewSrc: string | null;
  storedImageError: string | null;
  previewLoading: boolean;
}

@Component({
  selector: 'app-capture-step',
  imports: [MatButtonModule, MatCardModule, MatIconModule, ImageViewerComponent, MobilePhotoPicker],
  templateUrl: './capture-step.html',
  styleUrl: './capture-step.scss',
})
export class CaptureStep {
  vm = input.required<CaptureStepViewModel>();

  fileChanged = output<File>();
  openCamera = output<void>();
  captureNewInstead = output<void>();
  clearImage = output<void>();
  startPhoneCapture = output<void>();

  hasBackCamera = resource({
    loader: () => hasBackCamera()
  });

  onMobileFileSelected(file: File): void {
    this.fileChanged.emit(file);
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.fileChanged.emit(file);
  }
}

/** Returns true if the device has a back camera */
async function hasBackCamera() {
  // 1. Check if the mediaDevices API is even supported (e.g., must be an HTTPS context)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn("MediaDevices API not supported.");
    return false;
  }

  try {
    // 2. Request a stream strictly requiring the environment (back) camera
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: 'environment' } }
    });

    // 3. If successful, a back camera exists! Clean up and stop the stream immediately.
    stream.getTracks().forEach(track => track.stop());
    return true;

  } catch (error: unknown) {
    // All browser-thrown getUserMedia errors inherit from Error (DOMException)
    if (error instanceof Error) {
      if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
        // Hardware doesn't support an 'environment' (back) camera
        return false;
      }

      if (error.name === 'NotAllowedError') {
        console.warn("User denied camera access permissions.");
        return false;
      }
    }

    // Catches edge cases like AbortError (camera locked by another app) or generic code issues
    console.error("Camera access failed due to an unexpected error:", error);
    return false;
  }
}



