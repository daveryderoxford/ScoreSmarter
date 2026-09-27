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
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { Fleet, getFleetName } from 'app/club-tenant/model/fleet';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { debounceTime, distinctUntilChanged, filter, map, startWith } from 'rxjs';
import { ClubStore } from '../../services/club-store';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { PageLayout } from 'app/shared/layout/page-layout';
import { ListDetailLayout } from 'app/shared/layout/list-detail-layout';
import { ListPane } from 'app/shared/layout/list-pane';
import { DetailPane } from 'app/shared/layout/detail-pane';

import { ImportExportMenuComponent } from 'app/shared/components/import-export-menu';
import { FleetsCsvService } from '../../services/fleets-csv.service';

@Component({
  selector: 'app-fleet-page',
  imports: [Toolbar, MatListModule, MatMenuModule,
    MatButtonModule, MatIconModule, RouterModule, MatDividerModule,
    MatTooltipModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, LoadingCentered,
    MatDividerModule, ImportExportMenuComponent, PageLayout, ListDetailLayout, ListPane, DetailPane],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fleet-page.html',
  styles: `
    :host {
      display: block;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 12px 8px;
    }

    .search {
      flex: 1 1 auto;
      min-width: 0;
    }

    .right-justify {
      margin-left: auto;
      margin-right: 8px;
    }
  `
})
export class FleetPage {
  cs = inject(ClubStore);
  private ds = inject(DialogsService);
  private snackbar = inject(MatSnackBar);
  private fleetsCsv = inject(FleetsCsvService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly breakpoints = inject(AppBreakpoints);

  private readonly navUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly detailChild = computed(() => {
    this.navUrl();
    const child = this.route.firstChild;
    if (!child) return undefined;
    const path = child.snapshot.url[0]?.path;
    if (path === 'add') return { kind: 'add' as const };
    if (path === 'edit') {
      return { kind: 'edit' as const, id: child.snapshot.paramMap.get('id') ?? '' };
    }
    return undefined;
  });

  readonly detailOpen = computed(() => !!this.detailChild());
  readonly selectedFleetId = computed(() => {
    const child = this.detailChild();
    return child?.kind === 'edit' ? child.id : null;
  });
  readonly showBack = computed(() => !this.breakpoints.isWideLayout() && this.detailOpen());
  readonly toolbarTitle = computed(() => {
    if (this.breakpoints.isWideLayout()) return 'Fleets';
    const child = this.detailChild();
    if (child?.kind === 'add') return 'Add Fleet';
    if (child?.kind === 'edit') {
      const fleet = this.cs.club().fleets.find(f => f.id === child.id);
      return fleet ? `Edit Fleet - ${getFleetName(fleet)}` : 'Edit Fleet';
    }
    return 'Fleets';
  });

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
    }).sort((a, b) => getFleetName(a).localeCompare(getFleetName(b)));
  });

  getFleetName = getFleetName;

  async deleteFleet(fleet: Fleet) {
    if (await this.ds.confirm('Delete Fleet', `Are you sure you want to delete ${getFleetName(fleet)}?`)) {
      try {
        await this.cs.removeFleet(fleet);
        if (this.selectedFleetId() === fleet.id) {
          await this.router.navigate(['/club/fleets']);
        }
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
