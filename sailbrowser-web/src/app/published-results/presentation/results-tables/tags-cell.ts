import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ClubTagDefinition } from 'app/club-tenant/model/club-tag';
import { readableForegroundFor } from 'app/club-tenant/presentation/tags/tag-chip-style';
import { resolveTags, type ResolvedTag } from '../../services/resolved-tag';

export type TagsCellAppearance = 'chips' | 'badges';

/**
 * Renders resolved tags for a row: full chips (labels) or compact colour-only
 * badges (dots) for tight layouts such as published results name cells.
 */
@Component({
  selector: 'app-tags-cell',
  standalone: true,
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (tag of visibleTags(); track tag.id) {
      @if (appearance() === 'badges') {
        <span
          role="img"
          [attr.aria-label]="badgeAriaLabel(tag)"
          class="tag-dot"
          [class.tag-dot--neutral]="!tag.unresolved && !tag.color"
          [class.tag-dot--unresolved]="tag.unresolved"
          [ngStyle]="badgeStyle(tag)"
        ></span>
      } @else {
        <span
          class="tag-chip"
          [class.tag-chip--unresolved]="tag.unresolved"
          [ngStyle]="chipStyle(tag)">
          {{ tag.label }}
        </span>
      }
    }
  `,
  styleUrls: [
    '../../../club-tenant/presentation/tags/tag-chip.scss',
  ],
  styles: [`
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 3px;
      vertical-align: middle;
    }
    :host(.tags-cell--chips) {
      gap: 4px;
    }
  `],
  host: {
    '[class.tags-cell--chips]': `appearance() === 'chips'`,
    '[class.tags-cell--badges]': `appearance() === 'badges'`,
  },
})
export class TagsCell {
  /** Tag ids on the row (e.g. `RaceResult.tags`). */
  readonly ids = input<readonly string[]>([]);
  /** Snapshot of tag definitions stored on the published doc. */
  readonly definitions = input<readonly ClubTagDefinition[]>([]);
  /** `chips` shows label text; `badges` shows small colour dots only (name column). */
  readonly appearance = input<TagsCellAppearance>('chips');

  protected readonly resolved = computed(() => resolveTags(this.ids(), this.definitions()));

  /** Published badge rows omit unrecognised tags after canonicalization. */
  protected readonly visibleTags = computed(() =>
    this.appearance() === 'badges'
      ? this.resolved().filter(t => !t.unresolved)
      : this.resolved(),
  );

  protected badgeAriaLabel(tag: ResolvedTag): string {
    return tag.unresolved ? `Unrecognised tag: ${tag.id}` : tag.label;
  }

  protected chipStyle(tag: ResolvedTag): Record<string, string> {
    if (tag.unresolved || !tag.color) return {};
    return {
      'background-color': tag.color,
      'border-color': tag.color,
      color: readableForegroundFor(tag.color),
    };
  }

  protected badgeStyle(tag: ResolvedTag): Record<string, string> {
    if (tag.unresolved || !tag.color) return {};
    return {
      'background-color': tag.color,
    };
  }
}
