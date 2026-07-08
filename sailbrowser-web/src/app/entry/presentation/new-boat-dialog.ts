import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import type { Boat } from 'app/boats';
import { normalizeSailNumber, sailNumberValidator } from 'app/boats/model/sail-number';
import { ClubStore } from 'app/club-tenant';
import { isSinglehanderClass } from 'app/club-tenant/model/boat-class';
import type { Handicap } from 'app/scoring/model/handicap';
import { type PersonalHandicapBand } from 'app/scoring/model/personal-handicap';
import { type HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getSchemesForTarget, getHandicapSchemeMetadata, handicapControlName } from 'app/scoring/model/handicap-scheme-metadata';
import { BoatCoreFields } from 'app/boats/presentation/boat-form/boat-core-fields';
import { startWith } from 'rxjs';

export interface NewBoatDialogResult {
  boat: Partial<Boat>;
  saveToRepository: boolean;
}

export interface NewBoatDialogData {
  prefilledHelm?: string;
  prefilledClass?: string;
}

@Component({
  selector: 'app-new-boat-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    BoatCoreFields,
  ],
  template: `
    <h2 mat-dialog-title>New Boat</h2>
    <mat-dialog-content class="dialog-content-scroll">
      <form [formGroup]="form" class="dialog-form">
        <app-boat-core-fields
          [form]="form"
          [boatLevelSchemes]="boatSchemes()"
          [showCrew]="!isSinglehander()" />

        <mat-checkbox formControlName="saveBoat">Save boat to repository</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="cancel()">Cancel</button>
      <button matButton="filled" type="button" (click)="save()" [disabled]="form.invalid || !form.dirty">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form {
      width: 100%;
      min-width: 0;
      padding-top: 8px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewBoatDialog {
  private readonly fb = inject(FormBuilder);
  private readonly cs = inject(ClubStore);
  private readonly dialogRef = inject(MatDialogRef<NewBoatDialog, NewBoatDialogResult | undefined>);
  private readonly dialogData = inject<NewBoatDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  readonly boatSchemes = computed<HandicapScheme[]>(() =>
    getSchemesForTarget(this.cs.club().supportedHandicapSchemes, 'boat')
  );

  readonly form: FormGroup = this.fb.group({
    boatClass: [this.dialogData?.prefilledClass ?? '', Validators.required],
    sailNumber: ['', [Validators.required, sailNumberValidator]],
    name: [''],
    helm: [this.dialogData?.prefilledHelm ?? '', Validators.required],
    crew: [''],
    personalHandicapBand: ['unknown' as PersonalHandicapBand | 'unknown'],
    tags: this.fb.nonNullable.control<string[]>([]),
    saveBoat: [true],
  });

  private readonly boatClassValue = toSignal(
    this.form.controls['boatClass'].valueChanges.pipe(startWith(this.form.controls['boatClass'].value)),
    { initialValue: this.form.controls['boatClass'].value },
  );

  readonly isSinglehander = computed(() =>
    isSinglehanderClass(String(this.boatClassValue() ?? '').trim(), this.cs.club().classes),
  );

  constructor() {
    for (const scheme of this.boatSchemes()) {
      if (scheme === 'Personal') continue;
      const meta = getHandicapSchemeMetadata(scheme);
      this.form.addControl(
        handicapControlName(scheme),
        this.fb.control<number | null>(meta.defaultValue, [
          Validators.required,
          Validators.min(meta.min),
          Validators.max(meta.max),
        ])
      );
    }

    effect(() => {
      if (this.isSinglehander()) {
        this.form.controls['crew'].setValue('', { emitEvent: false });
      }
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  save(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue() as Record<string, unknown>;

    const handicaps: Handicap[] = this.boatSchemes().filter(s => s !== 'Personal').map(scheme => {
      const meta = getHandicapSchemeMetadata(scheme);
      const value = Number(raw[handicapControlName(scheme)] ?? meta.defaultValue);
      return { scheme, value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue };
    });

    const boatClass = String(raw['boatClass'] ?? '').trim();
    const boat: Partial<Boat> = {
      boatClass,
      sailNumber: normalizeSailNumber(raw['sailNumber']),
      name: String(raw['name'] ?? '').trim(),
      helm: String(raw['helm'] ?? '').trim(),
      crew: isSinglehanderClass(boatClass, this.cs.club().classes)
        ? ''
        : String(raw['crew'] ?? '').trim(),
      isClub: false,
      handicaps: handicaps.length > 0 ? handicaps : undefined,
      personalHandicapBand: raw['personalHandicapBand'] === 'unknown'
        ? undefined
        : (raw['personalHandicapBand'] as PersonalHandicapBand | undefined),
      tags: Array.isArray(raw['tags']) ? (raw['tags'] as string[]) : [],
    };

    this.dialogRef.close({
      boat,
      saveToRepository: !!raw['saveBoat'],
    });
  }
}
