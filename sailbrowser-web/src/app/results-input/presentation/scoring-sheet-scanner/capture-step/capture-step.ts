import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ImageViewerComponent } from "app/shared/components/image-viewer";

/** Parent-derived UI state for the capture card (single source for layout branching). */
export interface CaptureStepViewModel {
  layout: 'reuse' | 'preview' | 'capture';
  isMobile: boolean;
  /** Set when layout === 'reuse' */
  reuseImageUrl: string | null;
  /** Set when layout === 'preview' */
  previewSrc: string | null;
  /** Firestore path exists but download URL failed */
  storedImageError: string | null;
}

@Component({
  selector: 'app-capture-step',
  imports: [MatButtonModule, MatCardModule, MatIconModule, ImageViewerComponent],
  templateUrl: './capture-step.html',
  styleUrl: './capture-step.scss'
})
export class CaptureStep {
  vm = input.required<CaptureStepViewModel>();

  fileChanged = output<Event>();
  openCamera = output<void>();
  captureNewInstead = output<void>();
  useExisting = output<void>();
  clearImage = output<void>();
  startPhoneCapture = output<void>();
}
