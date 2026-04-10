import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import type { Boat } from 'app/boats';
import { ClubStore } from 'app/club-tenant';
import type { Handicap } from 'app/scoring/model/handicap';
import { type HandicapScheme } from 'app/scoring/model/handicap-scheme';
import { getSchemesForTarget, getHandicapSchemeMetadata, handicapControlName } from 'app/scoring/model/handicap-scheme-metadata';
import { BoatCoreFields } from 'app/boats/presentation/boat-form/boat-core-fields';

export interface NewBoatDialogResult {
  boat: Partial<Boat>;
  saveToRepository: boolean;
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
    <mat-dialog-content class="dialog-content">
      <form [formGroup]="form" class="dialog-form">
        <app-boat-core-fields [form]="form" [boatLevelSchemes]="boatSchemes()" />

        <mat-checkbox formControlName="saveBoat">Save boat to repository</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="outlined" type="button" (click)="cancel()">Cancel</button>
      <button matButton="tonal" type="button" (click)="save()" [disabled]="form.invalid || !form.dirty">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-content {
      overflow: hidden;
      max-height: none;
    }
    .dialog-form {
      width: 100%;
      min-width: 0;
      padding-top: 8px;
      overflow: hidden;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewBoatDialog {
  private readonly fb = inject(FormBuilder);
  private readonly cs = inject(ClubStore);
  private readonly dialogRef = inject(MatDialogRef<NewBoatDialog, NewBoatDialogResult | undefined>);

  readonly boatSchemes = computed<HandicapScheme[]>(() =>
    getSchemesForTarget(this.cs.club().supportedHandicapSchemes, 'boat')
  );

  readonly form: FormGroup = this.fb.group({
    boatClass: ['', Validators.required],
    sailNumber: [null as number | null, [Validators.required, Validators.min(1)]],
    name: [''],
    helm: ['', Validators.required],
    crew: [''],
    saveBoat: [true],
  });

  constructor() {
    for (const scheme of this.boatSchemes()) {
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
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  save(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue() as Record<string, unknown>;

    const handicaps: Handicap[] = this.boatSchemes().map(scheme => {
      const meta = getHandicapSchemeMetadata(scheme);
      const value = Number(raw[handicapControlName(scheme)] ?? meta.defaultValue);
      return { scheme, value: Number.isFinite(value) && value > 0 ? value : meta.defaultValue };
    });

    const boat: Partial<Boat> = {
      boatClass: String(raw['boatClass'] ?? '').trim(),
      sailNumber: Number(raw['sailNumber']),
      name: String(raw['name'] ?? '').trim(),
      helm: String(raw['helm'] ?? '').trim(),
      crew: String(raw['crew'] ?? '').trim(),
      isClub: false,
      handicaps: handicaps.length > 0 ? handicaps : undefined,
    };

    this.dialogRef.close({
      boat,
      saveToRepository: !!raw['saveBoat'],
    });
  }
}
