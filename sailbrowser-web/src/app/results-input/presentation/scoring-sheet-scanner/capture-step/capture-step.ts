import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ImageViewerComponent } from 'app/shared/components/image-viewer';

export type CaptureStepMode = 'stored' | 'newPreview' | 'empty';

/** Parent-derived UI state for the capture card. */
export interface CaptureStepViewModel {
  mode: CaptureStepMode;
  isMobile: boolean;
  previewSrc: string | null;
  storedImageError: string | null;
}

@Component({
  selector: 'app-capture-step',
  imports: [MatButtonModule, MatCardModule, MatIconModule, ImageViewerComponent],
  templateUrl: './capture-step.html',
  styleUrl: './capture-step.scss',
})
export class CaptureStep {
  vm = input.required<CaptureStepViewModel>();

  fileChanged = output<Event>();
  openCamera = output<void>();
  captureNewInstead = output<void>();
  clearImage = output<void>();
  startPhoneCapture = output<void>();
}
