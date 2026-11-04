import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from 'app/auth/auth.service';
import { ClubStore } from 'app/club-tenant/services/club-store';
import { PublishedResultsReader } from 'app/published-results/services/published-results-store';
import type { Series } from 'app/race-calendar/model/series';
import { RaceCalendarStore } from 'app/race-calendar/services/full-race-calendar';
import type { SeriesEntry } from 'app/results-input/model/series-entry';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { PageLayout } from 'app/shared/layout/page-layout';
import { firstValueFrom } from 'rxjs';
import { eventRacingStarted, seriesForEvent } from '../model/open-event';
import { EventEntries } from '../services/event-entries';
import { type EventEntryDetails, EventEntryService } from '../services/event-entry.service';
import { EventStore } from '../services/event-store';
import { EventEntryDialog, type EventEntryDialogData } from './event-entry-dialog';

interface SeriesEntries {
  series: Series;
  entries: SeriesEntry[];
  showClass: boolean;
}

/** Public home of an open meeting: documents, results and the entry list. Race officers manage entries here. */
@Component({
  selector: 'app-event-page',
  imports: [PageLayout, Toolbar, MatCardModule, MatButtonModule, MatIconModule, MatMenuModule, RouterLink, DatePipe, LoadingCentered],
  providers: [EventEntries],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-page.html',
  styleUrl: './event-page.scss',
})
export class EventPage {
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly store = inject(EventStore);
  private readonly calendar = inject(RaceCalendarStore);
  private readonly club = inject(ClubStore);
  private readonly published = inject(PublishedResultsReader);
  private readonly entries = inject(EventEntries);
  private readonly entryService = inject(EventEntryService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogs = inject(DialogsService);
  private readonly snackbar = inject(MatSnackBar);

  readonly event = this.store.event(this.id);
  readonly loading = computed(() => this.store.loading() || this.calendar.isLoading());
  readonly series = computed(() => seriesForEvent(this.id(), this.calendar.allSeries()));
  readonly seasonName = computed(() => this.club.club().seasons.find(s => s.id === this.event()?.seasonId)?.name ?? '');
  readonly racingStarted = computed(() => eventRacingStarted(this.series().map(s => s.id), this.calendar.allRaces()));
  readonly entriesLoading = this.entries.loading;
  readonly busy = signal(false);

  readonly entryCount = computed(() => this.entries.entries().length);

  readonly entriesBySeries = computed((): SeriesEntries[] => {
    const all = this.entries.entries();
    return this.series().map(series => ({
      series,
      entries: all.filter(e => e.seriesId === series.id),
      showClass: series.primaryScoringConfiguration.fleet.type !== 'BoatClass',
    }));
  });

  /** Published standings for the event's series, including divisions scored as their own series. */
  readonly results = computed(() => {
    const event = this.event();
    if (!event) return [];
    const ids = new Set(this.series().map(s => s.id));
    const season = this.published.seasons().find(s => s.id === event.seasonId);
    return (season?.series ?? [])
      .filter(info => ids.has(info.baseSeriesId ?? info.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() {
    effect(() => this.entries.seriesIds.set(this.series().map(s => s.id)));
  }

  divisionNames(entry: SeriesEntry, series: Series): string {
    return (entry.divisions ?? [])
      .map(id => series.divisions?.find(d => d.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  }

  async addEntry(): Promise<void> {
    const details = await this.openDialog({ series: this.series(), canMove: false });
    if (!details) return;
    await this.run(() => this.entryService.addEntry(details), 'Entry added');
  }

  async editEntry(entry: SeriesEntry): Promise<void> {
    const details = await this.openDialog({ series: this.series(), entry, canMove: !this.racingStarted() });
    if (!details) return;
    if (details.seriesId === entry.seriesId) {
      await this.run(() => this.entryService.updateEntry(entry, details), 'Entry saved');
    } else {
      await this.run(() => this.entryService.moveEntry(entry, details), 'Entry moved');
    }
  }

  async deleteEntry(entry: SeriesEntry): Promise<void> {
    const ok = await this.dialogs.confirm(
      'Delete entry?',
      `${entry.helm}, ${entry.boatClass} ${entry.sailNumber} is removed from every race in the series.`,
      { confirm: 'Delete' },
    );
    if (!ok) return;
    await this.run(() => this.entryService.deleteEntry(entry), 'Entry deleted');
  }

  async importEntries(): Promise<void> {
    const { ImportEntriesDialog } = await import('app/entry/presentation/import-entries-dialog');
    const imported = await firstValueFrom(
      this.dialog.open(ImportEntriesDialog, {
        width: '720px',
        maxWidth: '95vw',
        data: { seriesIds: this.series().map(s => s.id) },
      }).afterClosed(),
    );
    if (imported) this.snackbar.open('Entries imported', 'Dismiss', { duration: 4000 });
  }

  private openDialog(data: EventEntryDialogData): Promise<EventEntryDetails | undefined> {
    return firstValueFrom(
      this.dialog.open<EventEntryDialog, EventEntryDialogData, EventEntryDetails>(EventEntryDialog, { data, maxWidth: '95vw' })
        .afterClosed(),
    );
  }

  private async run(work: () => Promise<unknown>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await work();
      this.snackbar.open(done, 'Dismiss', { duration: 3000 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      this.snackbar.open(message, 'Dismiss', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }
}
