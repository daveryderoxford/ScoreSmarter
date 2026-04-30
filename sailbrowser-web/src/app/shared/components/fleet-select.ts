import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { ClubStore } from 'app/club-tenant';
import { getFleetName } from 'app/club-tenant/model/fleet';

@Component({
  selector: 'app-fleet-select',
  imports: [MatFormFieldModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    mat-form-field {
      width: 100%;
    }
  `,
  template: `
    <mat-form-field>
      <mat-label>{{ label() }}</mat-label>
      <mat-select [value]="fleetId()" (selectionChange)="onSelectionChange($event)">
        @if (includeAllOption()) {
          <mat-option value="">{{ allOptionLabel() }}</mat-option>
        }
        @for (fleet of fleets(); track fleet.id) {
          <mat-option [value]="fleet.id">{{ getFleetName(fleet) }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
})
export class FleetSelect {
  private readonly clubStore = inject(ClubStore);

  fleetId = input('');
  label = input('Fleet');
  includeAllOption = input(false);
  allOptionLabel = input('All');
  fleetIdChange = output<string>();

  protected getFleetName = getFleetName;
  protected fleets = computed(() =>
    [...this.clubStore.club().fleets].sort((a, b) => getFleetName(a).localeCompare(getFleetName(b))),
  );

  protected onSelectionChange(event: MatSelectChange): void {
    this.fleetIdChange.emit((event.value as string) ?? '');
  }
}
