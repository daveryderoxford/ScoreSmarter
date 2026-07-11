import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ResolvedRaceCompetitor } from '../../model/resolved-race-competitor';

export interface LinkScanRowDialogData {
  rowIndex: number;
  competitors: ResolvedRaceCompetitor[];
  /** Optional scan hints shown in the title. */
  scannedClass?: string;
  scannedSail?: string;
}

export interface LinkScanRowDialogResult {
  competitorId: string;
}

@Component({
  selector: 'app-link-scan-row-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Link to race entry</h2>
    <mat-dialog-content>
      <p class="hint">
        Use an existing race entry’s details with this scan row’s time and laps.
        @if (scanHint) {
          <span> Scanned as {{ scanHint }}.</span>
        }
      </p>
      <mat-form-field style="width:100%">
        <mat-label>Race entry</mat-label>
        <mat-select [value]="selectedId()" (valueChange)="selectedId.set($event)">
          @for (c of data.competitors; track c.id) {
            <mat-option [value]="c.id">
              {{ c.helm }} — {{ c.boatClass }} #{{ c.sailNumber }}
            </mat-option>
          }
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="dialogRef.close()">Cancel</button>
      <button
        matButton="filled"
        type="button"
        [disabled]="!selectedId()"
        (click)="confirm()">
        Link
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      line-height: 1.4;
    }
  `,
})
export class LinkScanRowDialog {
  protected readonly data = inject<LinkScanRowDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(
    MatDialogRef<LinkScanRowDialog, LinkScanRowDialogResult | undefined>,
  );

  protected readonly selectedId = signal<string | null>(this.data.competitors[0]?.id ?? null);

  protected get scanHint(): string | null {
    const parts = [this.data.scannedClass, this.data.scannedSail ? `#${this.data.scannedSail}` : '']
      .map(p => p?.trim())
      .filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }

  protected confirm(): void {
    const competitorId = this.selectedId();
    if (!competitorId) return;
    this.dialogRef.close({ competitorId });
  }
}
