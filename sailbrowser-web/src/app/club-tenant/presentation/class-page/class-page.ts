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
import { ClubStore } from '../../services/club-store';
import { LoadingCentered } from "app/shared/components/loading-centered";
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BoatClass } from '../../model/boat-class';
import { getHandicapValue } from 'app/scoring/model/handicap';
import { HandicapScheme } from 'app/scoring/model/handicap-scheme';

@Component({
  selector: 'app-class-page',
  imports: [Toolbar, MatListModule,
    MatButtonModule, MatIconModule, RouterModule, MatDividerModule,
    ReactiveFormsModule, MatFormFieldModule, MatInputModule, LoadingCentered,
    MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './class-page.html',
  styles: `
    @use "mixins" as mix;

    @include mix.centered-column-page(".content", 450px);

  `
})
export class ClassPage {
  cs = inject(ClubStore);
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

  filteredClasses = computed(() => {
    const filter = this.searchTerm()?.toLowerCase() || '';
    return this.cs.club().classes.filter((boatClass: BoatClass) => 
      boatClass.name.toLowerCase().includes(filter)
    ).sort((a, b) => a.name.localeCompare(b.name));
  });

  pyHandicap(boatClass: BoatClass): number | undefined {
    return getHandicapValue(boatClass.handicaps, 'PY' as HandicapScheme);
  }

  async deleteClass(boatClass: BoatClass) {
    if (await this.ds.confirm('Delete Class', `Are you sure you want to delete ${boatClass.name}?`)) {
      try {
        await this.cs.removeClass(boatClass);
        this.snackbar.open("Class deleted", "Dismiss", { duration: 3000 });
      } catch (error: any) {
        this.snackbar.open("Error deleting class", "Dismiss", { duration: 3000 });
        console.error('Error deleting class:', error);
      }
    }
  }
}
