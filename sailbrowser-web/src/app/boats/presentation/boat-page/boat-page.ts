import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { Toolbar } from 'app/shared/components/toolbar';
import { boatFilter, BoatsStore } from '../../services/boats.store';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Boat } from 'app/boats';
import { groupBy } from 'app/shared/utils/group-by';
import { BoatsCsvService } from '../../services/boats-csv.service';
import { ClubStore } from 'app/club-tenant';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getSchemesForTarget } from 'app/scoring/model/handicap-scheme-metadata';

@Component({
  selector: 'app-boat-page',
  imports: [Toolbar, MatListModule, MatMenuModule,
    MatButtonModule, MatIconModule, RouterModule, MatDividerModule,
    MatTooltipModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, LoadingCentered,
    MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './boat-page.html',
  styles: `
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 450px);

    .search-bar {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin: 12px 0px;
    }

    .search {
      flex: 1 1 auto;
      min-width: 0;
    }

    .group-by {
      flex: 0 0 110px;
      width: 110px;
    }

    .right-justify {
      flex: 0 0 85px;
      width: 88px;
      min-width: 85px;
    }
  `
})
export class BoatsPage {
  bs = inject(BoatsStore);
  private clubStore = inject(ClubStore);
  private ds = inject(DialogsService);
  private snackbar = inject(MatSnackBar);
  private boatsCsv = inject(BoatsCsvService);

  searchControl = new FormControl('');
  groupByControl = new FormControl<'helm' | 'boatClass'>('helm', { nonNullable: true });
  searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(100),
      distinctUntilChanged()
    ), { initialValue: '' }
  );
  groupByMode = toSignal(
    this.groupByControl.valueChanges.pipe(startWith(this.groupByControl.value)),
    { initialValue: 'helm' as 'helm' | 'boatClass' }
  );

  filteredBoats = computed(() => {
    const filter = this.searchTerm();
    return this.bs.boats().filter((boat: Boat) => boatFilter(boat, filter));
  });

  groupedBoats = computed(() => {
    const mode = this.groupByMode();
    const boats = this.filteredBoats();
    const grouped = groupBy(boats, boat => {
      if (mode === 'helm') {
        const helm = boat.helm?.trim();
        if (helm) return helm;
        return boat.isClub ? 'Club boats' : 'Unknown helm';
      }
      return (boat.boatClass || 'Unknown class').trim() || 'Unknown class';
    });

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entries]) => ({ key, boats: entries }));
  });

  boatSecondaryLabel(boat: Boat): string {
    if (boat.isClub && this.groupByMode() === 'helm') {
      return `Club ${boat.boatClass} No ${boat.sailNumber}`;
    }
    const sailLabel = this.boatSailLabel(boat);
    if (this.groupByMode() === 'helm') {
      return `${boat.boatClass} ${sailLabel}`;
    }
    const helm = boat.helm?.trim();
    return helm ? `${sailLabel}    ${helm}` : sailLabel;
  }

  boatSailLabel(boat: Boat): string {
    return boat.isClub ? `Club Boat ${boat.sailNumber}` : `${boat.sailNumber}`;
  }

  boatHandicapSummary(boat: Boat): string {
    const parts = (boat.handicaps ?? []).map(h => `${h.scheme} ${h.value}`);
    if (boat.personalHandicapBand) {
      parts.push(`Personal band ${boat.personalHandicapBand}`);
    } else {
      parts.push('Personal band unknown');
    }
    return parts.join(' | ');
  }

  private readonly boatHandicapSchemes = computed<HandicapScheme[]>(() =>
    getSchemesForTarget(this.clubStore.club().supportedHandicapSchemes, 'boat')
  );

  async deleteBoat(boat: Boat) {
    if (await this.ds.confirm('Delete Boat', `Are you sure you want to delete ${boat.boatClass} ${this.boatSailLabel(boat)}?`)) {
      try {
        await this.bs.delete(boat.id);
        this.snackbar.open("Boat deleted", "Dismiss", { duration: 3000 });
      } catch (error: any) {
        this.snackbar.open("Error deleting boat", "Dismiss", { duration: 3000 });
        console.error('Error deleting boat:', error);
      }
    }
  }

  downloadCsv(): void {
    const csv = this.boatsCsv.buildCsv(this.bs.boats(), this.boatHandicapSchemes());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async importCsv(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = this.boatsCsv.parseCsv(text, this.boatHandicapSchemes());
      if (parsed.errors.length > 0) {
        const preview = parsed.errors.slice(0, 3).join(' | ');
        this.snackbar.open(`Import failed: ${preview}`, 'Dismiss', { duration: 9000 });
        return;
      }

      // Last row wins per identity key inside the same import file.
      const deduped = new Map<string, Partial<Boat>>();
      for (const boat of parsed.boats) {
        const key = boat.id?.trim()
          ? `id:${boat.id.trim()}`
          : `triplet:${this.boatsCsv.tripletKey({
              boatClass: boat.boatClass ?? '',
              sailNumber: boat.sailNumber ?? 0,
              helm: boat.helm ?? '',
            })}`;
        deduped.set(key, boat);
      }

      const existingById = new Map(this.bs.boats().map(b => [b.id, b]));
      const existingByTriplet = new Map(
        this.bs.boats().map(b => [this.boatsCsv.tripletKey(b), b])
      );

      let updated = 0;
      let created = 0;
      for (const boat of deduped.values()) {
        const csvId = boat.id?.trim();
        const byId = csvId ? existingById.get(csvId) : undefined;
        const byTriplet = existingByTriplet.get(
          this.boatsCsv.tripletKey({
            boatClass: boat.boatClass ?? '',
            sailNumber: boat.sailNumber ?? 0,
            helm: boat.helm ?? '',
          })
        );
        const target = byId ?? byTriplet;

        const { id: _ignored, ...payload } = boat;
        if (target) {
          await this.bs.update(target.id, payload);
          updated++;
        } else {
          await this.bs.add(payload);
          created++;
        }
      }

      this.snackbar.open(`Boats import complete: ${updated} updated, ${created} created`, 'Dismiss', {
        duration: 6000,
      });
    } catch (error: any) {
      this.snackbar.open(`Error importing boats CSV: ${error?.message ?? error}`, 'Dismiss', { duration: 8000 });
    } finally {
      input.value = '';
    }
  }
}
