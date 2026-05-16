import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClubStore, ClubTagDefinition } from 'app/club-tenant';
import { TagDefinitionList } from 'app/club-tenant/presentation/tags/tag-definition-list';
import { Toolbar } from 'app/shared/components/toolbar';

/**
 * Thin Club Admin page wrapping `app-tag-definition-list`. All of the
 * authoring UI (chips, edit dialog, validation) lives in the reusable
 * component; this page just binds the control to `Club.tagDefinitions`
 * via `ClubStore.update`.
 */
@Component({
  selector: 'app-tags-admin',
  standalone: true,
  imports: [Toolbar, TagDefinitionList, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-toolbar title="Tags" />
    <div class="content">
      <p class="lede">
        Tags label boats and series entries for filtering, scoring and display
        (e.g. Gold fleet, Under 16, Novice). Tag <em>ids</em> are permanent
        once saved - the label and colour can be changed later.
      </p>
      <app-tag-definition-list [formControl]="control" />
    </div>
  `,
  styles: [`
    .content {
      max-width: 720px;
      margin: 0 auto;
      padding: 16px;
    }
    .lede {
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: 16px;
    }
  `],
})
export class TagsAdmin {
  private readonly clubStore = inject(ClubStore);
  private readonly snackbar = inject(MatSnackBar);

  protected readonly control = new FormControl<ClubTagDefinition[]>([], { nonNullable: true });

  // Mirror the stored definitions into the control whenever the club doc
  // refreshes. We deliberately avoid two-way binding because writes go
  // through `ClubStore.update`, not through the control.
  private readonly clubTags = computed(() => this.clubStore.club().tagDefinitions);

  constructor() {
    effect(() => {
      const snapshot = this.clubTags();
      const current = this.control.value;
      if (!sameDefs(current, snapshot)) {
        this.control.setValue([...snapshot], { emitEvent: false });
      }
    });

    this.control.valueChanges.subscribe(async (next) => {
      try {
        await this.clubStore.update({ tagDefinitions: next });
      } catch (error: unknown) {
        this.snackbar.open('Failed to save tag changes', 'Dismiss', { duration: 4000 });
        console.error('TagsAdmin: failed to update tagDefinitions', error);
      }
    });
  }
}

function sameDefs(a: readonly ClubTagDefinition[], b: readonly ClubTagDefinition[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.label !== y.label ||
      (x.color ?? '') !== (y.color ?? '')
    ) {
      return false;
    }
  }
  return true;
}
