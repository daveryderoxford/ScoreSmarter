import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';
import type { Race } from '../../model/race';
import {
  groupRacesForPanel,
  isCompletedRace,
  racePanelLabelLine1,
  racePanelLabelLine2,
  type RacesPanelFilter,
  type RacesPanelPeriod,
} from './races-panel-utils';

const DEFAULT_AVAILABLE_FILTERS: readonly RacesPanelFilter[] = ['past', 'future', 'hideCompleted'];

@Component({
  selector: 'app-races-panel',
  imports: [
    MatChipsModule,
    MatListModule,
  ],
  template: `
    <section class="races-panel">
      <div class="races-panel-top-row">
        @if (showPastChip() || showFutureChip()) {
          <mat-chip-listbox class="period-chips" [multiple]="false" aria-label="Race date range">
            @if (showPastChip()) {
              <mat-chip-option
                [selected]="selectedPeriod() === 'past'"
                (click)="togglePeriod('past')">
                Past
              </mat-chip-option>
            }
            @if (showFutureChip()) {
              <mat-chip-option
                [selected]="selectedPeriod() === 'future'"
                (click)="togglePeriod('future')">
                Future
              </mat-chip-option>
            }
          </mat-chip-listbox>
        }
        @if (showHideCompletedChip()) {
          <mat-chip-listbox class="hide-completed-chip" [multiple]="false" aria-label="Hide completed races">
            <mat-chip-option
              [selected]="hideCompleted()"
              (click)="toggleHideCompleted()">
              Hide completed
            </mat-chip-option>
          </mat-chip-listbox>
        }
      </div>

      <div class="race-list-container">
        @if (dayGroups().length === 0) {
          <p class="hint">{{ emptyMessage() }}</p>
        } @else {
          <mat-selection-list
            class="race-list"
            [multiple]="isMultiSelect()"
            (selectionChange)="onSelectionChange($event)">
            @for (group of dayGroups(); track group.dateKey) {
              <div mat-subheader class="group-heading">{{ group.heading }}</div>
              @for (race of group.races; track race.id) {
                <mat-list-option
                  [value]="race.id"
                  [selected]="isSelected(race.id)"
                  togglePosition="before">
                  <span matListItemTitle>{{ raceLabel(race) }}</span>
                  <span matListItem>{{ raceLabel2(race) }}</span>
                </mat-list-option>
              }
            }
          </mat-selection-list>
        }
      </div>
    </section>
  `,
  styles: `

  @use '@angular/material' as mat;

    .races-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    .races-panel-top-row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 32px;
    }

    .period-chips {
      flex: 0 0 auto;
    }

    /* Push the hide-completed chip to the far right of the row. */
    .hide-completed-chip {
      flex: 0 0 auto;
      margin-left: auto;
    }

    .race-list-container {
      min-height: var(--races-panel-list-min-height, 336px);
      max-height: var(--races-panel-list-max-height, min(60vh, 420px));
      overflow-y: auto;
    }

    .race-list {
      padding-top: 0;
      padding-bottom: 0;
    }

    .hint {
      margin: 0 0 4px;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.6));
    }

    .group-heading {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.7));
    }


  :host {
  @include mat.list-overrides((
    list-item-label-text-size: var(--mat-sys-body-medium-size),
    list-item-leading-icon-start-space: 10px,
    list-item-leading-icon-end-space: 10px,
  ));
}


  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RacesPanel {
  races = input<readonly Race[]>([]);
  selectedRaceIds = input<readonly string[]>([]);
  maxSelections = input<number | undefined>(undefined);
  emptyMessage = input('No races found for the selected filters.');
  now = input(new Date());
  /**
   * Which filter chips the consumer wants to expose.
   * Defaults to all three; pass a subset (e.g. `['past', 'hideCompleted']`) to hide the rest.
   * Filters not in this list are also treated as inactive in the underlying race filtering,
   * so removing a chip can never leave a stale filter applied.
   */
  availableFilters = input<readonly RacesPanelFilter[]>(DEFAULT_AVAILABLE_FILTERS);
  selectedRaceIdsChange = output<string[]>();

  protected readonly selectedPeriod = signal<RacesPanelPeriod>(null);
  protected readonly hideCompleted = signal(false);

  protected readonly isMultiSelect = computed(() => this.maxSelections() !== 1);

  protected readonly showPastChip = computed(() => this.availableFilters().includes('past'));
  protected readonly showFutureChip = computed(() => this.availableFilters().includes('future'));
  /**
   * The hide-completed chip is only shown when the consumer enables it AND the user has the
   * Past period selected — completed races are inherently a "past" concept.
   */
  protected readonly showHideCompletedChip = computed(
    () => this.availableFilters().includes('hideCompleted') && this.selectedPeriod() === 'past',
  );

  /** Period that should actually be applied, ignoring any value that's been hidden via availableFilters. */
  private readonly effectivePeriod = computed<RacesPanelPeriod>(() => {
    const period = this.selectedPeriod();
    if (!period) return null;
    return this.availableFilters().includes(period) ? period : null;
  });
  /** Whether the hide-completed filter is configured AND turned on. */
  private readonly effectiveHideCompleted = computed(() =>
    this.showHideCompletedChip() && this.hideCompleted()
  );

  protected readonly dayGroups = computed(() => {
    const races = this.effectiveHideCompleted()
      ? this.races().filter(race => !isCompletedRace(race))
      : this.races();
    return groupRacesForPanel(races, this.effectivePeriod(), this.now());
  });

  protected togglePeriod(period: Exclude<RacesPanelPeriod, null>): void {
    const next = this.selectedPeriod() === period ? null : period;
    this.selectedPeriod.set(next);
    // Hide-completed only appears with Past; default it back to off whenever Past leaves.
    if (next !== 'past') {
      this.hideCompleted.set(false);
    }
  }

  protected toggleHideCompleted(): void {
    this.hideCompleted.update(current => !current);
  }

  protected isSelected(id: string): boolean {
    return this.selectedRaceIds().includes(id);
  }

  protected raceLabel(race: Race): string {
    return racePanelLabelLine1(race);
  }

protected raceLabel2(race: Race): string | undefined {
  return racePanelLabelLine2(race);
}

  protected onSelectionChange(event: MatSelectionListChange): void {
    let ids = event.source.selectedOptions.selected.map(opt => opt.value as string);

    const max = this.maxSelections();
    if (max != null && max > 1 && ids.length > max) {
      // Enforce maxSelections by deselecting whatever was just added.
      const justAdded = event.options
        .filter(opt => opt.selected)
        .map(opt => opt.value as string);
      for (const id of justAdded) {
        if (ids.length <= max) break;
        const opt = event.source.selectedOptions.selected.find(o => o.value === id);
        if (opt) {
          opt.selected = false;
          ids = ids.filter(x => x !== id);
        }
      }
    }

    this.selectedRaceIdsChange.emit(ids);
  }
}
