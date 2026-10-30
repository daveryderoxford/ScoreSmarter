import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { Toolbar } from 'app/shared/components/toolbar';
import { DetailPane } from 'app/shared/layout/detail-pane';
import { ListDetailLayout } from 'app/shared/layout/list-detail-layout';
import { listDetailRoute } from 'app/shared/layout/list-detail-route';
import { ListPane } from 'app/shared/layout/list-pane';
import { PageLayout } from 'app/shared/layout/page-layout';
import { ClubStore } from '../../services/club-store';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { MatSnackBar } from '@angular/material/snack-bar';
import { BoatClass } from '../../model/boat-class';
import { classKind, classRating, isSchemeOverridden } from '../../model/club-class';
import { listRating, nextRatingList } from '../../model/rating-list';
import { RatingListStore } from '../../services/rating-list-store';
import { ClassesCsvService } from '../../services/classes-csv.service';
import { ClassCatalogueStore } from '../../services/class-catalogue-store';

import { ImportExportMenuComponent } from 'app/shared/components/import-export-menu';
import {
  SyncSeriesHandicapsDialog,
  type SyncSeriesHandicapsDialogData,
} from './sync-series-handicaps-dialog';

@Component({
  selector: 'app-class-page',
  imports: [Toolbar, MatListModule,
    MatButtonModule, MatIconModule, RouterModule, MatDividerModule,
    ReactiveFormsModule, MatFormFieldModule, MatInputModule, LoadingCentered,
    ImportExportMenuComponent, PageLayout, ListDetailLayout, ListPane, DetailPane],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './class-page.html',
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
      flex: 0 0 auto;
    }

    .kind {
      display: inline-block;
      margin-right: 6px;
      padding: 0 6px;
      border-radius: 4px;
      font: var(--mat-sys-label-small);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .kind.local {
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }
  `
})
export class ClassPage {
  cs = inject(ClubStore);
  private dialog = inject(MatDialog);
  private snackbar = inject(MatSnackBar);
  private classesCsv = inject(ClassesCsvService);
  private catalogue = inject(ClassCatalogueStore);
  private ratingLists = inject(RatingListStore);

  constructor() {
    this.ratingLists.preload();
  }

  private readonly detail = listDetailRoute();

  readonly detailOpen = this.detail.detailOpen;
  readonly selectedClassId = this.detail.selectedId;
  readonly showBack = this.detail.showBack;
  readonly toolbarTitle = computed(() => {
    if (this.detail.isSplit()) return 'Classes';
    const child = this.detail.selection();
    if (child?.kind === 'add') return 'Add Class';
    if (child?.kind === 'edit') {
      const boatClass = this.cs.club().classes.find(c => c.id === child.id);
      return boatClass ? `Edit Class - ${boatClass.name}` : 'Edit Class';
    }
    return 'Classes';
  });

  searchControl = new FormControl('');
  searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(100),
      distinctUntilChanged()
    ), { initialValue: '' }
  );

  filteredClasses = computed(() => {
    const filter = this.searchTerm()?.toLowerCase() || '';
    return this.cs.club().classes.filter((boatClass: BoatClass) => 
      boatClass.name.toLowerCase().includes(filter)
    ).sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly kindOf = classKind;

  pyHandicap(boatClass: BoatClass): number | undefined {
    return classRating(boatClass, 'PY', this.ratingLists.lists(), new Date());
  }

  pyOverridden(boatClass: BoatClass): boolean {
    return classKind(boatClass) === 'rya' && isSchemeOverridden(boatClass, 'PY');
  }

  /** E.g. "1095 from 1 Mar 2027" when a published later PY list changes the class's PY. */
  upcomingPy(boatClass: BoatClass): string | undefined {
    if (classKind(boatClass) !== 'rya' || isSchemeOverridden(boatClass, 'PY')) return undefined;
    const next = nextRatingList(this.ratingLists.lists(), 'PY', new Date());
    const py = listRating(next, boatClass.catalogueId);
    if (!next || py === undefined || py === this.pyHandicap(boatClass)) return undefined;
    return `${py} from ${next.effectiveFrom.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  exportCsv() {
    const classes = this.cs.club().classes;
    const schemes = this.cs.club().supportedHandicapSchemes;
    const csv = this.classesCsv.buildCsv(classes, schemes, this.ratingLists.lists());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `classes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  openSyncSeriesHandicapsDialog(): void {
    const data: SyncSeriesHandicapsDialogData = {
      onApplied: plan => {
        const n = plan.updated.length;
        this.snackbar.open(
          n === 1 ? 'Updated handicaps for 1 entry.' : `Updated handicaps for ${n} entries.`,
          'Dismiss',
          { duration: 4000 },
        );
      },
    };
    this.dialog.open(SyncSeriesHandicapsDialog, { data, width: '480px' });
  }

  async importCsv(event: { event: Event }) {
    const input = event.event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const schemes = this.cs.club().supportedHandicapSchemes;
      const ratingLists = await this.ratingLists.load();
      const parsed = this.classesCsv.parseCsv(text, schemes, this.catalogue.byId(), ratingLists);
      const merged = this.classesCsv.merge(this.cs.club().classes, parsed.rows);
      const errors = [...parsed.errors, ...merged.errors];
      if (errors.length > 0) {
        const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : '';
        this.snackbar.open(`Import failed: ${errors[0]}${more}`, 'Dismiss', { duration: 8000 });
        return;
      }

      await this.cs.update({ classes: merged.classes });
      this.snackbar.open(`Classes imported: ${merged.added} added, ${merged.updated} updated.`, 'Dismiss', {
        duration: 4000,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.snackbar.open(`Import error: ${message}`, 'Dismiss', { duration: 5000 });
    } finally {
      input.value = '';
    }
  }
}
