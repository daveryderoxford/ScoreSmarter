import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
import { Season } from 'app/race-calender/model/season';

@Component({
  selector: 'app-season-page',
  imports: [Toolbar, MatListModule,
    MatButtonModule, MatIconModule, RouterModule, MatDividerModule,
    ReactiveFormsModule, MatFormFieldModule, MatInputModule, LoadingCentered,
    PageLayout, ListDetailLayout, ListPane, DetailPane],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './season-page.html',
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
  `
})
export class SeasonPage {
  cs = inject(ClubStore);

  private readonly detail = listDetailRoute();

  readonly detailOpen = this.detail.detailOpen;
  readonly selectedSeasonId = this.detail.selectedId;
  readonly showBack = this.detail.showBack;
  readonly toolbarTitle = computed(() => {
    if (this.detail.isSplit()) return 'Seasons';
    const child = this.detail.selection();
    if (child?.kind === 'add') return 'Add Season';
    if (child?.kind === 'edit') {
      const season = this.cs.club().seasons.find(s => s.id === child.id);
      return season ? `Edit Season - ${season.name}` : 'Edit Season';
    }
    return 'Seasons';
  });

  searchControl = new FormControl('');
  searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(100),
      distinctUntilChanged()
    ), { initialValue: '' }
  );

  filteredSeasons = computed(() => {
    const filter = this.searchTerm()?.toLowerCase() || '';
    return this.cs.club().seasons.filter((season: Season) =>
      season.name.toLowerCase().includes(filter)
    ).sort((a, b) => a.name.localeCompare(b.name));
  });
}
