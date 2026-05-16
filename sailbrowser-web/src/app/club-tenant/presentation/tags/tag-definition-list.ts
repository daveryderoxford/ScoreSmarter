import { NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { ClubTagDefinition } from '../../model/club-tag';
import { tagChipStyle } from './tag-chip-style';
import {
  TagDefinitionEditDialog,
  TagDefinitionEditDialogData,
} from './tag-definition-edit-dialog';

/**
 * Authoring UI for a `ClubTagDefinition[]` catalog.
 *
 * Exposed as a `ControlValueAccessor` over `ClubTagDefinition[]`, so the
 * Club Admin tags page binds it to a form control and writes the resulting
 * array back to `Club.tagDefinitions` through `ClubStore` with no list-
 * specific glue code. The same component can be reused anywhere else that
 * authors a tag catalog (e.g. importing from CSV in the future).
 *
 * Each chip is click-to-edit, with a remove control. Add-tag pops the
 * same dialog with `mode: 'create'`.
 */
@Component({
  selector: 'app-tag-definition-list',
  standalone: true,
  imports: [MatButtonModule, MatChipsModule, MatIconModule, NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TagDefinitionList),
      multi: true,
    },
  ],
  template: `
    @if (definitions().length === 0) {
      <span class="empty">No tags yet. Add one to start tagging boats.</span>
    } @else {
      <mat-chip-set class="list" aria-label="Club tags">
        @for (def of definitions(); track def.id) {
          <mat-chip
            [ngStyle]="styleFor(def.color)"
            [disabled]="disabled()"
            [attr.aria-label]="chipAriaLabel(def)"
            (click)="onEdit(def)">
            {{ def.label || '(blank)' }}
            <button
              matChipRemove
              type="button"
              [attr.aria-label]="'Remove tag ' + def.label"
              [disabled]="disabled()"
              (click)="onRemove($event, def)">
              <mat-icon>cancel</mat-icon>
            </button>
          </mat-chip>
        }
      </mat-chip-set>
    }

    <div class="actions">
      <button
        matButton="tonal"
        type="button"
        [disabled]="disabled()"
        (click)="onAdd()">
        <mat-icon>add</mat-icon>
        Add tag
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .list {
      margin-bottom: 12px;
    }
    .empty {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font-style: italic;
      font-size: 0.875rem;
      margin-bottom: 12px;
    }
    .actions {
      margin-top: 4px;
    }
  `],
})
export class TagDefinitionList implements ControlValueAccessor {
  private readonly dialog = inject(MatDialog);

  private readonly _value = signal<ClubTagDefinition[]>([]);
  protected readonly disabled = signal(false);
  protected readonly definitions = computed(() => this._value());

  private onChange: (value: ClubTagDefinition[]) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: ClubTagDefinition[] | null | undefined): void {
    this._value.set(Array.isArray(value) ? [...value] : []);
  }

  registerOnChange(fn: (value: ClubTagDefinition[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected chipAriaLabel(def: ClubTagDefinition): string {
    return `Edit tag ${def.label || def.id} (${def.id})`;
  }

  protected styleFor(color: ClubTagDefinition['color']): Record<string, string> {
    return tagChipStyle(color);
  }

  protected async onAdd(): Promise<void> {
    const result = await this.openDialog({
      value: null,
      existingIds: this._value().map(d => d.id),
      mode: 'create',
    });
    if (!result) return;
    const next = [...this._value(), result];
    this.commit(next);
  }

  protected async onEdit(def: ClubTagDefinition): Promise<void> {
    const result = await this.openDialog({
      value: def,
      existingIds: this._value().map(d => d.id),
      mode: 'edit',
    });
    if (!result) return;
    const next = this._value().map(d => (d.id === def.id ? result : d));
    this.commit(next);
  }

  protected onRemove(event: Event, def: ClubTagDefinition): void {
    event.stopPropagation();
    const next = this._value().filter(d => d.id !== def.id);
    this.commit(next);
  }

  private async openDialog(data: TagDefinitionEditDialogData): Promise<ClubTagDefinition | undefined> {
    const ref = this.dialog.open<
      TagDefinitionEditDialog,
      TagDefinitionEditDialogData,
      ClubTagDefinition | undefined
    >(TagDefinitionEditDialog, {
      data,
      width: '420px',
      autoFocus: 'first-tabbable',
    });
    return await firstValueFrom(ref.afterClosed());
  }

  private commit(next: ClubTagDefinition[]): void {
    this._value.set(next);
    this.onChange(next);
    this.onTouched();
  }
}
