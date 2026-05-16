import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  CLUB_TAG_COLOR_IDS,
  ClubTagColor,
  ClubTagDefinition,
} from '../../model/club-tag';

const KEBAB_CASE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Reactive form for editing one `ClubTagDefinition`. Exposed as a panel so
 * callers (the list authoring UI in admin, the dialog wrapper, future
 * embedded flows) can host it without re-implementing field-level
 * validation.
 *
 * Validation rules captured here so they live in one place:
 *  - `id` is required and kebab-case; immutable when `mode === 'edit'`.
 *  - `id` must be unique against `existingIds` (case-sensitive).
 *  - `label` is required and trimmed.
 *  - `color` is required (fixed palette; no unset/default).
 */
@Component({
  selector: 'app-tag-definition-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tag-definition-form.html',
  styleUrls: ['./tag-definition-form.scss'],
})
export class TagDefinitionForm implements OnInit {
  readonly value = input<ClubTagDefinition | null>(null);
  readonly existingIds = input<readonly string[]>([]);
  readonly mode = input<'create' | 'edit'>('create');

  /** Emits when the form is valid and the user has changed something. */
  readonly valueChange = output<ClubTagDefinition>();
  /** Emits the current validity each time it changes. */
  readonly validChange = output<boolean>();

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    id: ['', [Validators.required, this.idValidator()]],
    label: ['', [Validators.required, this.notBlankValidator()]],
    color: this.fb.control<ClubTagColor>(CLUB_TAG_COLOR_IDS[0], {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  /** Live-validity signal, also surfaced to consumers via `validChange`. */
  private readonly statusSignal = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  readonly valid = computed(() => this.statusSignal() === 'VALID');

  readonly colors = signal<readonly ClubTagColor[]>(CLUB_TAG_COLOR_IDS);

  constructor() {
    effect(() => {
      const v = this.value();
      this.form.reset({
        id: v?.id ?? '',
        label: v?.label ?? '',
        color: v?.color ?? CLUB_TAG_COLOR_IDS[0],
      });
      if (this.mode() === 'edit') {
        this.form.controls.id.disable({ emitEvent: false });
      } else {
        this.form.controls.id.enable({ emitEvent: false });
      }
    });

    effect(() => {
      this.validChange.emit(this.valid());
    });

    this.form.valueChanges.subscribe(() => {
      if (!this.form.valid) return;
      const v = this.snapshot();
      if (v) this.valueChange.emit(v);
    });
  }

  ngOnInit(): void {
    // Touch validators so `id` collisions show immediately when the form
    // is opened in `create` mode with the same id as something existing.
    this.form.controls.id.updateValueAndValidity({ emitEvent: false });
  }

  /** Returns the current form value as a `ClubTagDefinition` or `null` if invalid. */
  snapshot(): ClubTagDefinition | null {
    if (!this.form.valid) return null;
    const raw = this.form.getRawValue();
    return {
      id: raw.id.trim(),
      label: raw.label.trim(),
      color: raw.color,
    };
  }

  private idValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = String(control.value ?? '').trim();
      if (!value) return null;
      if (!KEBAB_CASE.test(value)) {
        return { idFormat: true };
      }
      const existing = this.existingIds();
      const original = this.value()?.id;
      if (existing.some(id => id === value && id !== original)) {
        return { duplicateId: true };
      }
      return null;
    };
  }

  private notBlankValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = String(control.value ?? '').trim();
      return value.length === 0 ? { blank: true } : null;
    };
  }
}
