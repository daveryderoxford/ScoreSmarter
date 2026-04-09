import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
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
import { LoadingCentered } from "app/shared/components/loading-centered";
import { Toolbar } from 'app/shared/components/toolbar';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { ClubStore } from '../../services/club-store';

@Component({
  selector: 'app-fleet-page',
  imports: [Toolbar, MatListModule, MatMenuModule,
    MatButtonModule, MatIconModule, RouterModule, MatDividerModule,
    MatTooltipModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, LoadingCentered,
    MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fleet-page.html',
  styles: `
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 450px);

    .system-fleet {
      cursor: default;
    }

    .system-lock-icon {
      color: #9e9e9e;
    }
  `
})
export class FleetPage {
  cs = inject(ClubStore);
  private ds = inject(DialogsService);
  private snackbar = inject(MatSnackBar);

  debugEffect = effect( () =>{
    console.log(JSON.stringify(this.filteredFleets()));
    console.log('\n')

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
        this.snackbar.open("Fleet deleted", "Dismiss", { duration: 3000 });
      } catch (error: any) {
        this.snackbar.open("Error deleting fleet", "Dismiss", { duration: 3000 });
        console.error('Error deleting fleet:', error);
      }
    }
  }
}
