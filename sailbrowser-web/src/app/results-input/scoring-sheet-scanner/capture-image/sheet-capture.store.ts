import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { CameraCaptureDialog } from '../../capture/camera-capture-dialog/camera-capture-dialog';
import {
  AcquisitionEvent,
  CaptureImage,
  CapturePreview,
  capturePreviewUrl,
  isCaptureReady,
} from '../../capture/capture-image.model';
import { CaptureStepMode } from '../../capture/capture-step/capture-step';
import {
  PhoneCaptureQrDialog,
  PhoneCaptureQrDialogResult,
} from '../../capture/phone-capture-qr-dialog/phone-capture-qr-dialog';
import { ResultsSheetCaptureService } from '../../capture/services/results-sheet-capture.service';
import { from, of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { ScanRunRequest } from '../model/scan-model';
import { RaceSelectionStore } from '../select-race/race-selection.store';

interface CameraCaptureResult {
  base64: string;
  preview: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Area 2 — fully owns image acquisition and the image source (stored race
 * sheet, phone capture, or desktop photo/file). The source is opaque to the
 * container/stepper, which only consumes `hasImage` / `justAcquired`. The
 * capture step additionally reads `preview` / `mode` for rendering.
 */
@Injectable()
export class SheetCaptureStore {
  private readonly raceSelection = inject(RaceSelectionStore);
  private readonly capture = inject(ResultsSheetCaptureService);
  private readonly dialog = inject(MatDialog);
  private readonly clubTenant = inject(ClubTenant);

  private readonly captureImage = signal<CaptureImage | null>(null);
  /** User chose "Capture new image" instead of the race's stored sheet for this visit. */
  private readonly dismissedStoredRaceSheet = signal(false);
  private readonly _justAcquired = signal<AcquisitionEvent | null>(null);

  private readonly raceStoredPath = computed(
    () => this.raceSelection.selectedRace()?.resultsSheetImage?.trim() ?? null,
  );

  readonly hasImage = computed(() => isCaptureReady(this.captureImage()));
  readonly justAcquired = this._justAcquired.asReadonly();

  readonly mode = computed<CaptureStepMode>(() => {
    const img = this.captureImage();
    const racePath = this.raceStoredPath();
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
  });

  private readonly storagePath = computed<string | undefined>(() => {
    const img = this.captureImage();
    return img?.kind === 'storagePath' ? img.path : undefined;
  });

  private readonly previewResource = rxResource<string | null, string | undefined>({
    params: () => this.storagePath(),
    stream: ({ params }) => (params ? from(this.capture.resolveDownloadUrl(params)) : of(null)),
    defaultValue: null,
  });

  readonly preview = computed<CapturePreview>(() => {
    const img = this.captureImage();
    if (img?.kind === 'inline') {
      return { src: capturePreviewUrl(img), loading: false, error: null };
    }
    if (img?.kind === 'storagePath') {
      const failed = !!this.previewResource.error();
      return {
        src: this.previewResource.value(),
        loading: this.previewResource.isLoading(),
        error: failed ? `Could not load race image from storage path: ${img.path}` : null,
      };
    }
    return { src: null, loading: false, error: null };
  });

  resetToRaceStoredSheet(): void {
    this.dismissedStoredRaceSheet.set(false);
    const path = this.raceStoredPath();
    this.captureImage.set(path ? { kind: 'storagePath', path } : null);
  }

  startNewCapture(): void {
    this.dismissedStoredRaceSheet.set(true);
    this.captureImage.set(null);
  }

  async setFromFile(file: File): Promise<void> {
    this.dismissedStoredRaceSheet.set(true);
    const dataUrl = await readFileAsDataUrl(file);
    this.captureImage.set({
      kind: 'inline',
      base64: dataUrl.split(',')[1],
      mimeType: file.type || 'image/jpeg',
      previewUrl: dataUrl,
    });
    this.markAcquired(false);
  }

  async openCameraCapture(): Promise<void> {
    this.dismissedStoredRaceSheet.set(true);
    const ref = this.dialog.open(CameraCaptureDialog, {
      width: '800px',
      maxWidth: '95vw',
      disableClose: true,
    });
    const result = (await firstValueFrom(ref.afterClosed())) as CameraCaptureResult | null;
    if (!result) return;
    this.captureImage.set({
      kind: 'inline',
      base64: result.base64,
      mimeType: 'image/jpeg',
      previewUrl: result.preview,
    });
    this.markAcquired(false);
  }

  async startPhoneCapture(): Promise<void> {
    const race = this.raceSelection.selectedRace();
    if (!race) {
      this.raceSelection.error.set('Select a race before starting phone capture.');
      return;
    }
    this.dismissedStoredRaceSheet.set(true);
    const ref = this.dialog.open<
      PhoneCaptureQrDialog,
      { clubId: string; raceId: string },
      PhoneCaptureQrDialogResult | undefined
    >(PhoneCaptureQrDialog, {
      width: '420px',
      maxWidth: '95vw',
      disableClose: true,
      data: { clubId: this.clubTenant.clubId, raceId: race.id },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (result?.outcome === 'uploaded') {
      this.captureImage.set({ kind: 'storagePath', path: result.storagePath });
      this.dismissedStoredRaceSheet.set(false);
      this.markAcquired(true);
    }
  }

  clear(): void {
    if (!this.dismissedStoredRaceSheet()) {
      const path = this.raceStoredPath();
      if (path) {
        this.captureImage.set({ kind: 'storagePath', path });
        return;
      }
    }
    this.captureImage.set(null);
  }

  /** Upload inline captures to the race's canonical storage path when confirming. */
  async persistIfNeeded(): Promise<{ storagePath: string } | null> {
    const img = this.captureImage();
    const raceId = this.raceSelection.selectedRaceId();
    if (!img || !raceId) return null;

    if (img.kind === 'storagePath') {
      return { storagePath: img.path };
    }

    const { storagePath } = await this.capture.uploadInlineImage({
      clubId: this.clubTenant.clubId,
      raceId,
      base64: img.base64,
      mimeType: img.mimeType,
    });
    this.dismissedStoredRaceSheet.set(false);
    this.captureImage.set({ kind: 'storagePath', path: storagePath });
    return { storagePath };
  }

  toScanRunFields(): Pick<ScanRunRequest, 'useStoredRaceSheet' | 'imageBase64' | 'imageMimeType'> {
    const img = this.captureImage();
    if (!img) return {};
    if (img.kind === 'inline') {
      return {
        useStoredRaceSheet: false,
        imageBase64: img.base64,
        imageMimeType: img.mimeType,
      };
    }
    return { useStoredRaceSheet: true, imageBase64: null, imageMimeType: null };
  }

  private markAcquired(autoAdvance: boolean): void {
    this._justAcquired.set({ at: Date.now(), autoAdvance });
  }
}
