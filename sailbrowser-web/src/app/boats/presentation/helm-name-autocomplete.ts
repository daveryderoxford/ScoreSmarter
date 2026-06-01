import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteModule } from '@angular/material/autocomplete';
import { BoatsStore } from 'app/boats/services/boats.store';
import { normaliseString } from 'app/shared/utils/string-utils';
import { startWith } from 'rxjs';

/**
 * Suggestion panel for helm names. Place as a sibling of the input inside `mat-form-field`:
 *
 * ```html
 * <input matInput formControlName="helm" [matAutocomplete]="helmAc.panel()" />
 * <app-helm-name-autocomplete #helmAc [control]="helmControl" />
 * ```
 */
@Component({
  selector: 'app-helm-name-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatAutocompleteModule],
  template: `
    <mat-autocomplete #panel="matAutocomplete">
      @for (name of filteredHelmNames(); track name) {
        <mat-option [value]="name">{{ name }}</mat-option>
      }
    </mat-autocomplete>
  `,
})
export class HelmNameAutocomplete implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly boatsStore = inject(BoatsStore);

  readonly control = input.required<AbstractControl<string | null>>();

  readonly panel = viewChild.required<MatAutocomplete>('panel');

  private readonly filterTerm = signal('');

  readonly filteredHelmNames = computed(() => {
    const term = normaliseString(this.filterTerm());
    const all = this.boatsStore.uniqueHelmNames();
    if (!term) return all;
    return all.filter(name => normaliseString(name).includes(term));
  });

  ngOnInit(): void {
    const control = this.control();
    this.filterTerm.set(control.value ?? '');
    control.valueChanges
      .pipe(startWith(control.value), takeUntilDestroyed(this.destroyRef))
      .subscribe(v => this.filterTerm.set(v ?? ''));
  }
}
