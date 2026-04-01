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
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { Toolbar } from 'app/shared/components/toolbar';
import { boatFilter, BoatsStore } from '../../services/boats.store';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Boat } from 'app/boats';

@Component({
  selector: 'app-boat-page',
  imports: [Toolbar, MatListModule, MatMenuModule,
    MatButtonModule, MatIconModule, RouterModule, MatDividerModule,
    MatTooltipModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, LoadingCentered,
    MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './boat-page.html',
  styles: `
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 400px)
  `
})
export class BoatsPage {
  bs = inject(BoatsStore);
  private ds = inject(DialogsService);
  private snackbar = inject(MatSnackBar);

  searchControl = new FormControl('');
  searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(100),
      distinctUntilChanged()
    ), { initialValue: '' }
  );

  filteredBoats = computed(() => {
    const filter = this.searchTerm();
    return this.bs.boats().filter((boat: Boat) => boatFilter(boat, filter));
  });

  async deleteBoat(boat: Boat) {
    if (await this.ds.confirm('Delete Boat', `Are you sure you want to delete ${boat.boatClass} ${boat.sailNumber}?`)) {
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

