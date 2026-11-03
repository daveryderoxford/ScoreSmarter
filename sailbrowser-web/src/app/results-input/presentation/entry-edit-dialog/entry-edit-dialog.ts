import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { normalizeSailNumber } from 'app/boats/model/sail-number';
import { Race, RaceCalendarStore } from 'app/race-calendar';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { Handicap } from 'app/scoring/model/handicap';
import { ScoreSmarterError } from 'app/shared/utils/scoresmarter-error';
import {
  EntryEditCommand,
  EntryEditScope,
  RaceCompetitorEditService,
} from '../../services/race-competitor-edit.service';
import {
  findCollidingEntry,
  IdentityChange,
  identityChange,
  PerHullIdentity,
} from '../../services/series-entry-identity';
import { SeriesEntryStore } from '../../services/series-entry-store';
import { EntryEditForm } from './entry-edit-form';
import { EntryEditScopeStep } from './entry-edit-scope';

export interface EntryEditDialogData {
  competitor: ResolvedRaceCompetitor;
}

@Component({
  selector: 'app-entry-edit-dialog',
  imports: [MatDialogModule, MatButtonModule, EntryEditForm, EntryEditScopeStep],
  template: `
    <h3 mat-dialog-title>{{ pendingChange() ? 'Which races?' : 'Edit entry' }}</h3>
    <mat-dialog-content class="dialog-content-scroll">
      @if (series(); as series) {
        @if (pendingChange(); as change) {
          <app-entry-edit-scope
            [competitor]="data.competitor"
            [command]="pending()!"
            [change]="change"
            [otherRaces]="otherRaces() ?? []"
            [strategy]="series.entryAlgorithm"
            [handicapPreview]="handicapPreview()"
            [existingEntry]="existingEntry()"
            [busy]="busy()"
            (confirmed)="onScopeConfirmed($event)"
            (back)="onBack()"
          />
        } @else {
          <app-entry-edit-form
            [competitor]="data.competitor"
            [series]="series"
            [initialCommand]="pending()"
            [busy]="busy()"
            (submitCommand)="onFormSubmit($event)"
            (cancelled)="dialogRef.close()"
          />
        }
      } @else {
        <p class="error">Series not loaded.</p>
      }
      @if (errorMessage(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }
    </mat-dialog-content>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .error {
        color: var(--mat-sys-error);
        font-size: 12px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryEditDialog {
  readonly dialogRef = inject(MatDialogRef<EntryEditDialog, boolean | undefined>);
  protected readonly data = inject<EntryEditDialogData>(MAT_DIALOG_DATA);
  private readonly editService = inject(RaceCompetitorEditService);
  private readonly raceCalendar = inject(RaceCalendarStore);
  private readonly seriesEntries = inject(SeriesEntryStore);

  protected readonly series = computed(() =>
    this.raceCalendar.allSeries().find(s => s.id === this.data.competitor.seriesId),
  );

  protected readonly pending = signal<EntryEditCommand | undefined>(undefined);
  protected readonly pendingChange = signal<Exclude<IdentityChange, 'none'> | undefined>(undefined);
  protected readonly otherRaces = signal<Race[] | undefined>(undefined);
  protected readonly handicapPreview = signal<Handicap[]>([]);
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal<string | undefined>(undefined);

  /** Another series entry that already has the pending identity, which the edit would join. */
  protected readonly existingEntry = computed(() => {
    const command = this.pending();
    if (!command) return undefined;
    const entry = this.data.competitor.entry;
    const sameSeries = this.seriesEntries.selectedEntries().filter(e => e.seriesId === entry.seriesId);
    return findCollidingEntry(sameSeries, identityOf(command), entry.id);
  });

  async onFormSubmit(command: EntryEditCommand): Promise<void> {
    await this.run(async () => {
      const change = identityChange(this.data.competitor.entry, identityOf(command));
      if (change !== 'none') {
        const others = await this.loadOtherRaces();
        if (others.length > 0) {
          this.handicapPreview.set(
            change === 'class' ? await this.editService.previewHandicaps(command) : [],
          );
          this.pending.set(command);
          this.pendingChange.set(change);
          return;
        }
      }
      await this.save(command);
    });
  }

  async onScopeConfirmed(scope: EntryEditScope): Promise<void> {
    const command = this.pending();
    if (!command) return;
    await this.run(() => this.save({ ...command, scope }));
  }

  onBack(): void {
    this.errorMessage.set(undefined);
    this.pendingChange.set(undefined);
  }

  private async loadOtherRaces(): Promise<Race[]> {
    const cached = this.otherRaces();
    if (cached) return cached;
    const races = await this.editService.otherRacesOnEntry(this.data.competitor.id);
    this.otherRaces.set(races);
    return races;
  }

  private async save(command: EntryEditCommand): Promise<void> {
    await this.editService.applyEntryEdit(command);
    this.dialogRef.close(true);
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.errorMessage.set(undefined);
    this.busy.set(true);
    try {
      await work();
    } catch (err) {
      this.errorMessage.set(
        err instanceof ScoreSmarterError || err instanceof Error ? err.message : 'Failed to save changes.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}

function identityOf(command: EntryEditCommand): PerHullIdentity {
  return {
    helm: command.helm.trim(),
    boatClass: command.boatClass.trim(),
    sailNumber: normalizeSailNumber(command.sailNumber),
  };
}
