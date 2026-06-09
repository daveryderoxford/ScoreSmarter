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
import {
  CaptureImage,
  capturePreviewUrl,
  isCaptureReady,
} from '../scoring-sheet-scanner/scan-model';

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

  protected readonly captureImage = signal<CaptureImage | null>(null);

  protected readonly hasImage = computed(() => isCaptureReady(this.captureImage()));

  protected readonly vm = computed((): CaptureStepViewModel => {
    const img = this.captureImage();
    return {
      mode: img ? 'newPreview' : 'empty',
      isMobile: this.data.isMobile,
      previewSrc: capturePreviewUrl(img),
      storedImageError: null,
      previewLoading: false,
    };
  });

  protected onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      this.clearImage();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const readResult = reader.result as string;
      this.captureImage.set({
        kind: 'inline',
        base64: readResult.split(',')[1],
        mimeType: file.type,
        previewUrl: readResult,
      });
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
      this.captureImage.set({
        kind: 'inline',
        base64: result.base64,
        mimeType: 'image/jpeg',
        previewUrl: result.preview,
      });
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
    this.captureImage.set(null);
  }

  protected confirm(): void {
    const img = this.captureImage();
    if (!img) return;
    if (img.kind === 'storagePath') {
      this.dialogRef.close({ outcome: 'stored', storagePath: img.path });
      return;
    }
    this.dialogRef.close({
      outcome: 'inline',
      base64: img.base64,
      mimeType: img.mimeType,
      preview: img.previewUrl,
    });
  }

  protected cancel(): void {
    this.dialogRef.close({ outcome: 'cancelled' });
  }
}
