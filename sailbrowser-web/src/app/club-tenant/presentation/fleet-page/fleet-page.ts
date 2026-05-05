import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import { ImportExportMenuComponent } from 'app/shared/components/import-export-menu';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { ClubStore } from '../../services/club-store';
import { FleetsCsvService } from '../../services/fleets-csv.service';

@Component({
  selector: 'app-fleet-page',
  imports: [Toolbar, MatListModule, MatMenuModule,
    MatButtonModule, MatIconModule, RouterModule, MatDividerModule,
    MatTooltipModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, LoadingCentered,
    MatDividerModule, ImportExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fleet-page.html',
  styles: `
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 450px);
  `
})
export class FleetPage {
  cs = inject(ClubStore);
  private ds = inject(DialogsService);
  private snackbar = inject(MatSnackBar);
  private fleetsCsv = inject(FleetsCsvService);

  searchControl = new FormControl('');
  searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(100),
      distinctUntilChanged()
    ), { initialValue: '' }
  );

  filteredFleets = computed(() => {
    const filter = this.searchTerm()?.toLowerCase() || '';
    return this.cs.club().fleets.filter((fleet: Fleet) => {
      if (fleet.type === 'GeneralHandicap') return false; // Hide system General Handicap fleet from the UI
      const name = getFleetName(fleet).toLowerCase();
      return name.includes(filter);
    }).sort((a: Fleet, b: Fleet) => getFleetName(a).localeCompare(getFleetName(b)));
  });

  getFleetName = getFleetName;

  async deleteFleet(fleet: Fleet) {
    if (await this.ds.confirm('Delete Fleet', `Are you sure you want to delete ${getFleetName(fleet)}?`)) {
      try {
        await this.cs.removeFleet(fleet);
        this.snackbar.open("Fleet deleted", "Dismiss", { duration: 3000 });
      } catch (error: any) {
        this.snackbar.open("Error deleting fleet", "Dismiss", { duration: 3000 });
        console.error('Error deleting fleet:', error);
      }
    }
  }

  exportCsv() {
    const fleets = this.cs.club().fleets;
    const csv = this.fleetsCsv.buildCsv(fleets);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fleets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async importCsv(event: { event: Event, context: any }) {
    const input = event.event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = this.fleetsCsv.parseCsv(text);
      if (parsed.errors.length > 0) {
        this.snackbar.open(`Import failed: ${parsed.errors[0]}`, 'Dismiss', { duration: 5000 });
        return;
      }

      await this.cs.update({ fleets: parsed.fleets as any });
      this.snackbar.open(`Fleets imported: ${parsed.fleets.length} items.`, 'Dismiss', { duration: 3000 });
    } catch (error: any) {
      this.snackbar.open(`Import error: ${error.message}`, 'Dismiss', { duration: 5000 });
    } finally {
      input.value = '';
    }
  }
}
