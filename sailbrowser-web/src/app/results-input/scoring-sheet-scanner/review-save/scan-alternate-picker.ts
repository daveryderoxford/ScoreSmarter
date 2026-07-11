import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ScannedValue } from '../model/scan-model';

/** Icon + menu to promote an alternate scanned value into the primary slot. */
@Component({
  selector: 'app-scan-alternate-picker',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    <div class="field-with-alts">
      <ng-content />
      @if (hasAlternatives()) {
        <button
          matIconButton
          type="button"
          class="alt-button"
          [matMenuTriggerFor]="altMenu"
          [attr.aria-label]="label()"
          [matTooltip]="label()">
          <mat-icon>swap_horiz</mat-icon>
        </button>
        <mat-menu #altMenu="matMenu">
          <button mat-menu-item disabled>
            <mat-icon>check</mat-icon>
            {{ scanned()?.value }}
          </button>
          @for (alt of scanned()?.alternatives; track alt) {
            <button mat-menu-item type="button" (click)="selected.emit(alt)">
              {{ alt }}
            </button>
          }
        </mat-menu>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    .field-with-alts {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      max-width: 100%;
    }

    .alt-button {
      width: 28px;
      height: 28px;
      padding: 0;
      color: var(--mat-sys-on-surface-variant);

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
  `,
})
export class ScanAlternatePicker {
  /** Field with optional alternatives; icon is hidden when empty. */
  readonly scanned = input<ScannedValue<string | number> | undefined>();
  /** Accessible name / tooltip for the trigger button. */
  readonly label = input('Choose alternate value');
  readonly selected = output<string | number>();

  protected readonly hasAlternatives = computed(() => !!this.scanned()?.alternatives?.length);
}
