import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Boat } from 'app/boats';
import { EntryService } from 'app/entry/services/entry.service';
import { RaceCalendarStore } from 'app/race-calender';

export interface KnownBoatEntryDialogData {
  raceId: string;
  boatClass: string;
  sailNumber: number;
  boats: Boat[];
}

export interface KnownBoatEntryDialogResult {
  created: boolean;
  selectedBoatId?: string;
}

@Component({
  selector: 'app-known-boat-entry-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Known boat found</h2>
    <mat-dialog-content>
      <p>Select helm/boat to create a race entry for {{ data.boatClass }} #{{ data.sailNumber }}.</p>
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
      <button mat-button (click)="dialogRef.close(false)" [disabled]="saving()">Cancel</button>
      <button matButton="filled" (click)="createEntry()" [disabled]="!selectedBoat() || saving()">Create entry</button>
    </mat-dialog-actions>
  `,
})
export class KnownBoatEntryDialog {
  protected readonly data = inject<KnownBoatEntryDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<KnownBoatEntryDialog>);
  private readonly entryService = inject(EntryService);
  private readonly raceCalendarStore = inject(RaceCalendarStore);

  protected readonly selectedBoatId = signal<string | null>(this.data.boats[0]?.id ?? null);
  protected readonly saving = signal(false);
  protected readonly selectedBoat = computed(() => this.data.boats.find(b => b.id === this.selectedBoatId()) ?? null);

  protected async createEntry(): Promise<void> {
    const boat = this.selectedBoat();
    const race = this.raceCalendarStore.allRaces().find(r => r.id === this.data.raceId);
    if (!boat || !race) return;

    this.saving.set(true);
    try {
      await this.entryService.enterRaces({
        races: [race],
        boatClass: boat.boatClass,
        sailNumber: boat.sailNumber,
        helm: boat.helm,
        crew: boat.crew,
        handicaps: boat.handicaps,
        personalHandicapBand: boat.personalHandicapBand,
      });
      this.dialogRef.close({ created: true, selectedBoatId: boat.id } satisfies KnownBoatEntryDialogResult);
    } finally {
      this.saving.set(false);
    }
  }
}
