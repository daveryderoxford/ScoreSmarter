import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { BusyButton } from 'app/shared/components/busy-button';
import { ImageViewerComponent } from 'app/shared/components/image-viewer';
import { firstValueFrom } from 'rxjs';
import { CameraCaptureDialog } from '../camera-capture-dialog/camera-capture-dialog';
import type { CaptureImage } from '../capture-image.model';
import { CaptureStep, CaptureStepViewModel } from '../capture-step/capture-step';
import {
  PhoneCaptureQrDialog,
  PhoneCaptureQrDialogData,
  PhoneCaptureQrDialogResult,
} from '../phone-capture-qr-dialog/phone-capture-qr-dialog';
import { toScanInlineCapture } from '../resize-scan-image';
import { ResultsSheetCaptureService } from '../services/results-sheet-capture.service';

type InlineCapture = CaptureImage & { kind: 'inline' };

/**
 * Captures a new scoring sheet for one race and stores it as soon as it is taken. Starts with
 * the capture choices, never the race's existing image. Emits the storage path once saved.
 */
@Component({
  selector: 'app-sheet-capture-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, BusyButton, CaptureStep, ImageViewerComponent],
  templateUrl: './sheet-capture-pane.html',
  styleUrl: './sheet-capture-pane.scss',
})
export class SheetCapturePane {
  private readonly dialog = inject(MatDialog);
  private readonly captureService = inject(ResultsSheetCaptureService);
  private readonly clubTenant = inject(ClubTenant);

  readonly raceId = input.required<string>();
  readonly isMobile = input(false);
  readonly saved = output<string>();

  protected readonly image = linkedSignal<string, InlineCapture | null>({
    source: () => this.raceId(),
    computation: () => null,
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly vm = computed<CaptureStepViewModel>(() => ({
    mode: 'empty',
    isMobile: this.isMobile(),
    previewSrc: null,
    storedImageError: null,
    previewLoading: false,
    saving: false,
    saveError: null,
  }));

  protected async onFile(file: File): Promise<void> {
    await this.capture(await toScanInlineCapture(file));
  }

  protected async openCamera(): Promise<void> {
    const ref = this.dialog.open(CameraCaptureDialog, {
      width: '800px',
      maxWidth: '95vw',
      disableClose: true,
    });
    const result = (await firstValueFrom(ref.afterClosed())) as { preview: string } | null;
    if (!result) return;
    await this.capture(await toScanInlineCapture(result.preview));
  }

  protected async startPhoneCapture(): Promise<void> {
    const ref = this.dialog.open<PhoneCaptureQrDialog, PhoneCaptureQrDialogData, PhoneCaptureQrDialogResult | undefined>(
      PhoneCaptureQrDialog,
      {
        width: '420px',
        maxWidth: '95vw',
        disableClose: true,
        data: { clubId: this.clubTenant.clubId, raceId: this.raceId() },
      },
    );
    const result = await firstValueFrom(ref.afterClosed());
    if (result?.outcome === 'uploaded') this.saved.emit(result.storagePath);
  }

  protected retake(): void {
    this.error.set(null);
    this.image.set(null);
  }

  private async capture(img: InlineCapture): Promise<void> {
    this.image.set(img);
    await this.save();
  }

  protected async save(): Promise<void> {
    const img = this.image();
    if (!img || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const { storagePath } = await this.captureService.uploadInlineImage({
        clubId: this.clubTenant.clubId,
        raceId: this.raceId(),
        base64: img.base64,
        mimeType: img.mimeType,
      });
      this.image.set(null);
      this.saved.emit(storagePath);
    } catch (err: unknown) {
      console.error('SheetCapturePane: upload failed', err);
      this.error.set(err instanceof Error ? err.message : 'Could not save the scoring sheet.');
    } finally {
      this.saving.set(false);
    }
  }
}
