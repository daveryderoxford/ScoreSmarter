import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { CameraCaptureDialog } from '../scoring-sheet-scanner/camera-capture-dialog';
import { CaptureStep, CaptureStepViewModel } from '../scoring-sheet-scanner/capture-step/capture-step';
import {
  PhoneCaptureQrDialog,
  PhoneCaptureQrDialogData,
  PhoneCaptureQrDialogResult,
} from '../scoring-sheet-scanner/phone-capture-qr-dialog/phone-capture-qr-dialog';
import { MatDialog } from '@angular/material/dialog';

export interface ScoringSheetCaptureDialogData {
  clubId: string;
  raceId: string;
  isMobile: boolean;
}

export type ScoringSheetCaptureDialogResult =
  | { outcome: 'cancelled' }
  | { outcome: 'inline'; base64: string; mimeType: string; preview: string }
  | { outcome: 'stored'; storagePath: string };

/**
 * Reusable dialog that wraps the {@link CaptureStep} panel and the existing
 * camera / phone-QR sub-dialogs. Owns only capture-time state (no persistence)
 * so callers (e.g. ResultsSheetCaptureService) can decide how to upload/store
 * the captured image.
 */
@Component({
  selector: 'app-scoring-sheet-capture-dialog',
  imports: [MatButtonModule, MatDialogModule, CaptureStep],
  templateUrl: './scoring-sheet-capture-dialog.html',
  styleUrl: './scoring-sheet-capture-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoringSheetCaptureDialog {
  protected readonly data = inject<ScoringSheetCaptureDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<ScoringSheetCaptureDialog, ScoringSheetCaptureDialogResult | undefined>,
  );
  private readonly subDialog = inject(MatDialog);

  protected readonly imageBase64 = signal<string | null>(null);
  protected readonly imageMimeType = signal<string | null>(null);
  protected readonly imagePreview = signal<string | null>(null);
  protected readonly storedImagePath = signal<string | null>(null);

  protected readonly hasImage = computed(
    () => (!!this.imageBase64() && !!this.imageMimeType()) || !!this.storedImagePath(),
  );

  protected readonly vm = computed((): CaptureStepViewModel => {
    const previewSrc = this.imagePreview();
    if (previewSrc) {
      return {
        layout: 'preview',
        isMobile: this.data.isMobile,
        reuseImageUrl: null,
        previewSrc,
        storedImageError: null,
      };
    }
    return {
      layout: 'capture',
      isMobile: this.data.isMobile,
      reuseImageUrl: null,
      previewSrc: null,
      storedImageError: null,
    };
  });

  protected onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      this.clearImage();
      return;
    }
    this.imageMimeType.set(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const readResult = reader.result as string;
      this.imagePreview.set(readResult);
      this.imageBase64.set(readResult.split(',')[1]);
      this.storedImagePath.set(null);
    };
    reader.readAsDataURL(file);
  }

  protected openCameraDialog(): void {
    const ref = this.subDialog.open(CameraCaptureDialog, {
      width: '800px',
      maxWidth: '95vw',
      disableClose: true,
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      this.imageBase64.set(result.base64);
      this.imagePreview.set(result.preview);
      this.imageMimeType.set('image/jpeg');
      this.storedImagePath.set(null);
    });
  }

  protected async startPhoneCapture(): Promise<void> {
    const ref = this.subDialog.open<
      PhoneCaptureQrDialog,
      PhoneCaptureQrDialogData,
      PhoneCaptureQrDialogResult | undefined
    >(PhoneCaptureQrDialog, {
      width: '420px',
      maxWidth: '95vw',
      disableClose: true,
      data: { clubId: this.data.clubId, raceId: this.data.raceId },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (result?.outcome === 'uploaded') {
      this.dialogRef.close({ outcome: 'stored', storagePath: result.storagePath });
    }
  }

  protected clearImage(): void {
    this.imageBase64.set(null);
    this.imageMimeType.set(null);
    this.imagePreview.set(null);
    this.storedImagePath.set(null);
  }

  protected confirm(): void {
    const storedPath = this.storedImagePath();
    if (storedPath) {
      this.dialogRef.close({ outcome: 'stored', storagePath: storedPath });
      return;
    }
    const base64 = this.imageBase64();
    const mimeType = this.imageMimeType();
    const preview = this.imagePreview();
    if (base64 && mimeType && preview) {
      this.dialogRef.close({ outcome: 'inline', base64, mimeType, preview });
    }
  }

  protected cancel(): void {
    this.dialogRef.close({ outcome: 'cancelled' });
  }
}
