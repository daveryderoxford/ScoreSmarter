import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { RaceCalendarStore } from 'app/race-calender';
import type { Race } from 'app/race-calender/model/race';
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
import { toScanInlineCapture } from '../../capture/resize-scan-image';
import { ResultsSheetCaptureService } from '../../capture/services/results-sheet-capture.service';
import { from, of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { ScanRunRequest } from '../model/scan-model';
import { ScanSelectedRace } from '../select-race/race-selection.store';

/** Selected races not yet linked to the sheet image at `storagePath`. */
export function racesToLinkToSheet(races: readonly Race[], storagePath: string): Race[] {
  return races.filter(r => (r.resultsSheetImage?.trim() ?? '') !== storagePath);
}

interface CameraCaptureResult {
  base64: string;
  preview: string;
}

/**
 * Area 2 — fully owns image acquisition and the image source (stored race
 * sheet, phone capture, or desktop photo/file). The source is opaque to the
 * container/stepper, which only consumes `hasImage` / `justAcquired`. The
 * capture step additionally reads `preview` / `mode` for rendering.
 */
@Injectable()
export class SheetCaptureStore {
  private readonly raceSelection = inject(ScanSelectedRace);
  private readonly capture = inject(ResultsSheetCaptureService);
  private readonly dialog = inject(MatDialog);
  private readonly clubTenant = inject(ClubTenant);
  private readonly raceCalendar = inject(RaceCalendarStore);

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
    this.captureImage.set(await toScanInlineCapture(file));
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
    this.captureImage.set(await toScanInlineCapture(result.preview));
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

  /**
   * Upload inline captures to the race's canonical storage path when confirming, and link
   * the sheet image to every selected race (a Level Rating sheet may hold several).
   */
  async persistIfNeeded(): Promise<{ storagePath: string } | null> {
    const img = this.captureImage();
    const raceId = this.raceSelection.selectedRaceId();
    if (!img || !raceId) return null;

    if (img.kind === 'storagePath') {
      await this.linkSheetImageToRaces(img.path);
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
    await this.linkSheetImageToRaces(storagePath);
    return { storagePath };
  }

  /** Points the selected races at the stored sheet image; a failure doesn't stop the scan. */
  private async linkSheetImageToRaces(storagePath: string): Promise<void> {
    const races = racesToLinkToSheet(this.raceSelection.selectedRaces(), storagePath);
    if (races.length === 0) return;
    try {
      await this.raceCalendar.updateRaces(races.map(r => ({ id: r.id, data: { resultsSheetImage: storagePath } })));
    } catch (error: unknown) {
      console.error('SheetCaptureStore: linking the sheet image to the selected races failed', error);
    }
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
