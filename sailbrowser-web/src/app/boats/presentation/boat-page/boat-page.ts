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
  private ds = inject(DialogsService);
  private snackbar = inject(MatSnackBar);

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
}

