import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  divisionById,
  markerDivisionIds,
  type Division,
} from 'app/race-calender/model/division';

/** Colour dots for marker-style divisions beside a helm name. */
@Component({
  selector: 'app-division-markers-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (div of visibleMarkers(); track div.id) {
      <span
        role="img"
        [attr.aria-label]="div.name"
        class="division-dot"
        [class.division-dot--neutral]="!div.color"
        [style.background-color]="div.color || null"
      ></span>
    }
  `,
  styleUrls: [
    '../../../club-tenant/presentation/divisions/division-chip.scss',
  ],
  styles: [`
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 3px;
      vertical-align: middle;
    }
  `],
})
export class DivisionMarkersCell {
  readonly ids = input<readonly string[]>([]);
  readonly definitions = input<readonly Division[]>([]);

  protected readonly visibleMarkers = computed(() => {
    const defs = this.definitions();
    return markerDivisionIds(this.ids(), defs).map(id => {
      const def = divisionById(id, defs);
      return { id, name: def?.name ?? id, color: def?.display.markerColor };
    });
  });
}
