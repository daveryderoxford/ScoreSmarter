import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-capture-step',
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './capture-step.html',
  styleUrl: './capture-step.scss'
})
export class CaptureStep {
  isMobile = input.required<boolean>();
  hasExistingImage = input.required<boolean>();
  imagePreview = input<string | null>(null);

  fileChanged = output<Event>();
  openCamera = output<void>();
  useExisting = output<void>();
  clearImage = output<void>();
}
