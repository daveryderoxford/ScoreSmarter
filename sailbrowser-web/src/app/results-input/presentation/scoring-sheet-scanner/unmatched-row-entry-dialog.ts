import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { HelmNameAutocomplete } from 'app/boats/presentation/helm-name-autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  EntryConflict,
  EntryService,
} from 'app/entry/services/entry.service';
import { RaceCalendarStore } from 'app/race-calender';
import { CurrentRaces } from '../../services/current-races-store';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import type { EntryConflictSummary } from 'app/shared/dialogs/entry-conflict-dialog';

export interface UnmatchedRowEntryDialogData {
  raceId: string;
  boatClass: string;
  sailNumber: string;
}

export interface UnmatchedRowEntryDialogResult {
  created: boolean;
  helm?: string;
}

@Component({
  selector: 'app-unmatched-row-entry-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    HelmNameAutocomplete,
  ],
  template: `
    <h2 mat-dialog-title>Add race entry</h2>
    <mat-dialog-content>
      <p class="hint">
        Creating an entry for <strong>{{ data.boatClass }} #{{ data.sailNumber }}</strong>
        from the scanned row.
      </p>
      <form [formGroup]="form" class="entry-form" (ngSubmit)="createEntry()">
        <mat-form-field class="field">
          <mat-label>Helm</mat-label>
          <input
            matInput
            formControlName="helm"
            autocomplete="off"
            [matAutocomplete]="helmAutocomplete.panel()" />
          <app-helm-name-autocomplete
            #helmAutocomplete
            [control]="form.controls.helm" />
          <mat-error>Helm is required</mat-error>
        </mat-form-field>
        <mat-form-field class="field">
          <mat-label>Crew (optional)</mat-label>
          <input matInput formControlName="crew" autocomplete="off" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="dialogRef.close()" [disabled]="saving()">
        Cancel
      </button>
      <button
        matButton="filled"
        type="button"
        (click)="createEntry()"
        [disabled]="form.invalid || saving()">
        {{ saving() ? 'Adding…' : 'Add entry' }}
      </button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    mat-dialog-content {
      min-width: 360px;
    }
    .hint {
      margin: 0 0 16px;
      font-size: 0.875rem;
      line-height: 1.4;
    }
    .entry-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .field {
      width: 100%;
    }
  `],
})
export class UnmatchedRowEntryDialog {
  protected readonly data = inject<UnmatchedRowEntryDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<UnmatchedRowEntryDialog, UnmatchedRowEntryDialogResult | undefined>);
  private readonly fb = inject(FormBuilder);
  private readonly entryService = inject(EntryService);
  private readonly raceCalendarStore = inject(RaceCalendarStore);
  private readonly currentRaces = inject(CurrentRaces);
  private readonly dialogs = inject(DialogsService);
  private readonly snackbar = inject(MatSnackBar);

  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    helm: ['', Validators.required],
    crew: [''],
  });

  protected async createEntry(): Promise<void> {
    if (this.form.invalid || this.saving()) return;

    const race = this.raceCalendarStore.allRaces().find(r => r.id === this.data.raceId);
    if (!race) {
      this.snackbar.open('Race not found.', 'Dismiss', { duration: 4000 });
      return;
    }

    const helm = this.form.controls.helm.value.trim();
    const crew = this.form.controls.crew.value.trim() || undefined;

    const entryData = {
      races: [race],
      helm,
      crew,
      boatClass: this.data.boatClass,
      sailNumber: this.data.sailNumber,
      tags: [] as string[],
    };

    const conflicts = this.entryService.findEntryConflicts(entryData);
    if (conflicts.length > 0) {
      const choice = await this.dialogs.promptEntryConflict(
        conflicts.map(c => summariseConflict(c)),
      );
      if (choice === 'cancel') return;
    }

    this.saving.set(true);
    try {
      this.currentRaces.addRaceId(this.data.raceId);
      if (conflicts.length > 0) {
        await this.entryService.swapAndEnter(entryData, conflicts);
      } else {
        await this.entryService.enterRaces(entryData);
      }
      this.dialogRef.close({ created: true, helm } satisfies UnmatchedRowEntryDialogResult);
    } catch (err: unknown) {
      console.error('UnmatchedRowEntryDialog: create entry failed', err);
      const message = err instanceof Error ? err.message : 'Could not add entry.';
      this.snackbar.open(message, 'Dismiss', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }
}

function summariseConflict(c: EntryConflict): EntryConflictSummary {
  const e = c.existingEntry;
  const existingLabel = `${e.helm} – ${e.boatClass} #${e.sailNumber}`;
  const raceLabel = `${c.race.seriesName} race ${c.race.index}`;
  const reasonLabel = (() => {
    switch (c.reason) {
      case 'sameEntry':
        return 'Exact same boat is already entered.';
      case 'sameHelmDifferentHull':
        return 'This series merges by helm, so a sailor can only enter one boat per race.';
      case 'sameHullDifferentHelm':
        return 'This series merges by boat, so a hull can only be entered once per race.';
    }
  })();
  return { raceLabel, existingLabel, reasonLabel };
}
