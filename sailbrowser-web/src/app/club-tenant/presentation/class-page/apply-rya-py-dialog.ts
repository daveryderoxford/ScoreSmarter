import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ryaPn } from '../../model/catalog-class';
import { applyRyaPyUpdates, ryaPyUpdatePlan } from '../../model/club-class';
import { ClassCatalogueStore } from '../../services/class-catalogue-store';
import { ClubStore } from '../../services/club-store';

/** Sets the PY of the club's RYA classes to the RYA PNs in the current RYA list. */
@Component({
  selector: 'app-apply-rya-py-dialog',
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Apply RYA PY list{{ version() ? ' (' + version() + ')' : '' }}</h2>
    <mat-dialog-content>
      @if (catalogue.isLoading()) {
        <mat-spinner diameter="32" />
      } @else if (!listHasPns()) {
        <p>The RYA list has no PNs. A system administrator needs to upload the RYA list again.</p>
      } @else {
        @if (club().ryaPyListVersion; as applied) {
          <p class="note">Last applied: {{ applied }}</p>
        }
        @if (plan().updates.length === 0) {
          <p>All RYA classes already use the RYA PY.</p>
        } @else {
          <p>Set the PY of these classes to the RYA PN:</p>
          @for (change of plan().updates; track change.boatClass.id) {
            <mat-checkbox [checked]="!excluded().has(change.boatClass.id)" (change)="toggle(change.boatClass.id, $event.checked)">
              {{ change.boatClass.name }}: {{ change.current ?? 'none' }} → {{ change.rya }}
            </mat-checkbox>
          }
        }
        @if (plan().overridden.length > 0) {
          <p class="note">Overridden, left unchanged:</p>
          <ul class="note">
            @for (change of plan().overridden; track change.boatClass.id) {
              <li>{{ change.boatClass.name }}: {{ change.current }} (RYA {{ change.rya }})</li>
            }
          </ul>
        }
        <p class="note">
          Series already running keep their entries' handicaps; use "Update series handicaps" to update them.
        </p>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [disabled]="busy()" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" [disabled]="busy() || selectedCount() === 0" (click)="apply()">
        Apply{{ selectedCount() > 0 ? ' (' + selectedCount() + ')' : '' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: 320px;
      max-width: 480px;
    }
    mat-checkbox {
      display: block;
    }
    .note {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class ApplyRyaPyDialog {
  private readonly dialogRef = inject(MatDialogRef<ApplyRyaPyDialog, number | undefined>);
  private readonly clubStore = inject(ClubStore);
  protected readonly catalogue = inject(ClassCatalogueStore);

  protected readonly club = this.clubStore.club;
  protected readonly version = computed(() => this.catalogue.catalogue().ryaListVersion);
  protected readonly listHasPns = computed(() => this.catalogue.classes().some(c => ryaPn(c) !== undefined));
  protected readonly plan = computed(() => ryaPyUpdatePlan(this.club().classes, this.catalogue.byId()));
  protected readonly excluded = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedCount = computed(
    () => this.plan().updates.filter(u => !this.excluded().has(u.boatClass.id)).length,
  );
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected toggle(id: string, checked: boolean): void {
    const next = new Set(this.excluded());
    if (checked) next.delete(id);
    else next.add(id);
    this.excluded.set(next);
  }

  protected async apply(): Promise<void> {
    const plan = this.plan();
    const updates = plan.updates.filter(u => !this.excluded().has(u.boatClass.id));
    this.busy.set(true);
    this.error.set(null);
    try {
      const version = this.version();
      await this.clubStore.update({
        classes: applyRyaPyUpdates(this.club().classes, { ...plan, updates }),
        ...(version ? { ryaPyListVersion: version } : {}),
      });
      this.dialogRef.close(updates.length);
    } catch (e: unknown) {
      console.error('Applying RYA PY list failed', e);
      this.error.set('The PY list could not be applied. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
