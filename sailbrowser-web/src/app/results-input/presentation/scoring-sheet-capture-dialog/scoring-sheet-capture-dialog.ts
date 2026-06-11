import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import { from, of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { ResultsSheetCaptureService } from '../../services/results-sheet-capture.service';
import { CameraCaptureDialog } from '../scoring-sheet-scanner/camera-capture-dialog';
import { CaptureStep, CaptureStepMode, CaptureStepViewModel } from '../scoring-sheet-scanner/capture-step/capture-step';
import {
  PhoneCaptureQrDialog,
  PhoneCaptureQrDialogData,
  PhoneCaptureQrDialogResult,
} from '../scoring-sheet-scanner/phone-capture-qr-dialog/phone-capture-qr-dialog';
import {
  CaptureImage,
  capturePreviewUrl,
  isCaptureReady,
} from '../scoring-sheet-scanner/scan-model';

export interface ScoringSheetCaptureDialogData {
  clubId: string;
  raceId: string;
  isMobile: boolean;
  storedImagePath?: string | null;
}

export type ScoringSheetCaptureDialogResult =
  | { outcome: 'cancelled' }
  | { outcome: 'inline'; base64: string; mimeType: string; preview: string }
  | { outcome: 'stored'; storagePath: string };

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
  private readonly captureService = inject(ResultsSheetCaptureService);

  private readonly storedPath = signal(this.data.storedImagePath?.trim() || null);
  private readonly captureImage = signal<CaptureImage | null>(this.initialImage());
  private readonly dismissedStoredRaceSheet = signal(false);
  protected readonly confirming = signal(false);

  protected readonly hasImage = computed(() => isCaptureReady(this.captureImage()));

  protected readonly vm = computed((): CaptureStepViewModel => {
    const img = this.captureImage();
    const mode = this.mode();
    const previewSrc =
      img?.kind === 'storagePath'
        ? this.previewResource.value()
        : capturePreviewUrl(img);
    return {
      mode,
      isMobile: this.data.isMobile,
      previewSrc,
      storedImageError: this.previewResource.error()
        ? `Could not load race image from storage path: ${img?.kind === 'storagePath' ? img.path : ''}`
        : null,
      previewLoading:
        this.hasImage() &&
        img?.kind === 'storagePath' &&
        !previewSrc &&
        !this.previewResource.error(),
    };
  });

  private readonly storagePathNeedingResolution = computed<string | undefined>(() => {
    const img = this.captureImage();
    return img?.kind === 'storagePath' ? img.path : undefined;
  });

  private readonly previewResource = rxResource<string | null, string | undefined>({
    params: () => this.storagePathNeedingResolution(),
    stream: ({ params }) =>
      params ? from(this.captureService.resolveDownloadUrl(params)) : of(null),
    defaultValue: null,
  });

  private initialImage(): CaptureImage | null {
    const path = this.data.storedImagePath?.trim();
    return path ? { kind: 'storagePath', path } : null;
  }

  private mode(): CaptureStepMode {
    const img = this.captureImage();
    const racePath = this.storedPath();
    if (!img) return 'empty';
    if (img.kind === 'inline') return 'newPreview';
    if (
      img.kind === 'storagePath' &&
      racePath &&
      !this.dismissedStoredRaceSheet() &&
      img.path === racePath
    ) {
      return 'stored';
    }
    return 'newPreview';
  }

  protected onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      this.clearImage();
      return;
    }
    this.dismissedStoredRaceSheet.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      const readResult = reader.result as string;
      this.captureImage.set({
        kind: 'inline',
        base64: readResult.split(',')[1],
        mimeType: file.type || 'image/jpeg',
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
      this.dismissedStoredRaceSheet.set(true);
      this.captureImage.set({
        kind: 'inline',
        base64: result.base64,
        mimeType: 'image/jpeg',
        previewUrl: result.preview,
      });
    });
  }

  protected async startPhoneCapture(): Promise<void> {
    this.dismissedStoredRaceSheet.set(true);
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
      this.storedPath.set(result.storagePath);
      this.captureImage.set({ kind: 'storagePath', path: result.storagePath });
      this.dismissedStoredRaceSheet.set(false);
    }
  }

  protected captureNewInstead(): void {
    this.dismissedStoredRaceSheet.set(true);
    this.captureImage.set(null);
  }

  protected clearImage(): void {
    if (!this.dismissedStoredRaceSheet()) {
      const path = this.storedPath();
      if (path) {
        this.captureImage.set({ kind: 'storagePath', path });
        return;
      }
    }
    this.captureImage.set(null);
  }

  protected cancel(): void {
    this.dialogRef.close({ outcome: 'cancelled' });
  }

  protected async confirm(): Promise<void> {
    const img = this.captureImage();
    if (!img) return;
    if (img.kind === 'storagePath') {
      this.dialogRef.close({ outcome: 'stored', storagePath: img.path });
      return;
    }
    this.confirming.set(true);
    try {
      const { storagePath } = await this.captureService.uploadInlineImage({
        clubId: this.data.clubId,
        raceId: this.data.raceId,
        base64: img.base64,
        mimeType: img.mimeType,
      });
      this.dialogRef.close({ outcome: 'stored', storagePath });
    } finally {
      this.confirming.set(false);
    }
  }
}
