import { Component, OnDestroy, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { QRCodeComponent } from 'angularx-qrcode';
import { Subscription } from 'rxjs';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { ScannerPhoneCaptureService } from '../services/scanner-phone-capture.service';

export interface PhoneCaptureQrDialogData {
  clubId: string;
  raceId: string;
}

export type PhoneCaptureQrDialogResult =
  | { outcome: 'uploaded'; storagePath: string }
  | { outcome: 'cancelled' };

@Component({
  selector: 'app-phone-capture-qr-dialog',
  imports: [LoadingCentered, MatButtonModule, MatDialogModule, MatIconModule, QRCodeComponent],
  templateUrl: './phone-capture-qr-dialog.html',
  styleUrl: './phone-capture-qr-dialog.scss',
})
export class PhoneCaptureQrDialog implements OnDestroy {
  readonly data = inject<PhoneCaptureQrDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<PhoneCaptureQrDialog, PhoneCaptureQrDialogResult | undefined>);
  private readonly phoneCapture = inject(ScannerPhoneCaptureService);

  private watchSub?: Subscription;
  private finalized = false;

  readonly loadError = signal<string | null>(null);
  readonly captureUrl = signal<string | null>(null);
  readonly sessionStatus = signal<string>('pending');

  constructor() {
    queueMicrotask(() => void this.startSession());
  }

  ngOnDestroy(): void {
    this.teardownWatch();
  }

  private async startSession(): Promise<void> {
    if (this.finalized) return;
    try {
      const session = await this.phoneCapture.createCaptureSession(this.data.clubId, this.data.raceId);
      if (this.finalized) return;
      const url = `${window.location.origin}/results-sheet-phone-capture/${encodeURIComponent(session.sessionId)}/${encodeURIComponent(session.token)}`;
      this.captureUrl.set(url);
      this.watchSub = this.phoneCapture.watchCaptureSession(session.sessionId).subscribe(doc => {
        if (this.finalized || !doc) return;
        const status = doc.status ?? 'pending';
        this.sessionStatus.set(status);
        if (status === 'uploaded' && doc.storagePath) {
          this.finishWithUpload(doc.storagePath);
        }
      });
    } catch (e: unknown) {
      if (this.finalized) return;
      const message = e instanceof Error ? e.message : 'Could not start phone capture.';
      this.loadError.set(message);
    }
  }

  cancel(): void {
    if (!this.finalized) {
      this.finalized = true;
      this.teardownWatch();
      this.dialogRef.close({ outcome: 'cancelled' });
    }
  }

  private finishWithUpload(storagePath: string): void {
    if (this.finalized) return;
    this.finalized = true;
    this.teardownWatch();
    this.dialogRef.close({ outcome: 'uploaded', storagePath });
  }

  private teardownWatch(): void {
    this.watchSub?.unsubscribe();
    this.watchSub = undefined;
  }
}
