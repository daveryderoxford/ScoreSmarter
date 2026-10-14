import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Boat } from 'app/boats';

export interface KnownBoatEntryDialogData {
  boatClass: string;
  sailNumber: string;
  boats: Boat[];
}

export interface KnownBoatEntryDialogResult {
  selectedBoatId: string;
}

/** Picks the helm for a scanned row. The entry is created when the scan is saved. */
@Component({
  selector: 'app-known-boat-entry-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Select helm</h2>
    <mat-dialog-content>
      <p>Select the helm sailing {{ data.boatClass }} #{{ data.sailNumber }}.</p>
      <mat-form-field style="width:100%">
        <mat-label>Helm</mat-label>
        <mat-select [value]="selectedBoatId()" (valueChange)="selectedBoatId.set($event)">
          @for (boat of data.boats; track boat.id) {
            <mat-option [value]="boat.id">{{ boat.helm }}{{ boat.crew ? ' / ' + boat.crew : '' }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button matButton="filled" (click)="select()" [disabled]="!selectedBoat()">Select</button>
    </mat-dialog-actions>
  `,
})
export class KnownBoatEntryDialog {
  protected readonly data = inject<KnownBoatEntryDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<KnownBoatEntryDialog, KnownBoatEntryDialogResult | undefined>);

  protected readonly selectedBoatId = signal<string | null>(this.data.boats[0]?.id ?? null);
  protected readonly selectedBoat = computed(() => this.data.boats.find(b => b.id === this.selectedBoatId()) ?? null);

  protected select(): void {
    const boat = this.selectedBoat();
    if (!boat) return;
    this.dialogRef.close({ selectedBoatId: boat.id });
  }
}
