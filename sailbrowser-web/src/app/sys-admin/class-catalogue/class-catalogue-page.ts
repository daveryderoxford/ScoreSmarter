import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  isRyaClass,
  nextNegativeCatalogueId,
  normaliseClassName,
  type CatalogClass,
} from 'app/club-tenant/model/catalog-class';
import { mergeRyaClassList, parseRyaClassList, type RyaMergeResult } from 'app/club-tenant/model/rya-class-list';
import { ClassCatalogueStore } from 'app/club-tenant/services/class-catalogue-store';
import { Toolbar } from 'app/shared/components/toolbar';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import { PageLayout } from 'app/shared/layout/page-layout';

interface PendingImport {
  fileName: string;
  merge: RyaMergeResult;
  errors: string[];
}

/** Sys-admin maintenance of the global class catalogue (RYA list import, names, aliases, non-RYA classes). */
@Component({
  selector: 'app-class-catalogue-page',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
    Toolbar,
    PageLayout,
  ],
  templateUrl: './class-catalogue-page.html',
  styleUrl: './class-catalogue-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassCataloguePage {
  protected readonly store = inject(ClassCatalogueStore);
  private readonly snackbar = inject(MatSnackBar);

  protected readonly isRyaClass = isRyaClass;

  readonly search = signal('');
  readonly busy = signal(false);
  readonly pendingImport = signal<PendingImport | null>(null);
  readonly listVersion = signal('');

  /** Entry being edited (by catalogueId) and its draft values. */
  readonly editingId = signal<number | null>(null);
  readonly draftName = signal('');
  readonly draftAliases = signal('');

  readonly newName = signal('');
  readonly newCrew = signal(1);
  readonly newAliases = signal('');

  readonly filtered = computed(() => {
    const term = normaliseClassName(this.search());
    const classes = this.store.classes();
    if (!term) return classes;
    return classes.filter(c =>
      [c.name, c.rya?.name ?? '', String(c.catalogueId), ...(c.aliases ?? [])].some(v =>
        normaliseClassName(v).includes(term),
      ),
    );
  });

  readonly ryaCount = computed(() => this.store.classes().filter(isRyaClass).length);

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const { rows, errors } = parseRyaClassList(await file.text());
    if (rows.length === 0) {
      this.snackbar.open(errors[0] ?? 'No RYA classes found in the file.', 'Dismiss', { duration: 6000 });
      return;
    }
    this.pendingImport.set({ fileName: file.name, merge: mergeRyaClassList(this.store.classes(), rows), errors });
  }

  cancelImport(): void {
    this.pendingImport.set(null);
  }

  async saveImport(): Promise<void> {
    const pending = this.pendingImport();
    if (!pending) return;
    const version = normaliseWhitespace(this.listVersion()) || pending.fileName;
    if (await this.save(pending.merge.classes, version)) {
      this.pendingImport.set(null);
      this.snackbar.open(
        `RYA list imported: ${pending.merge.added} added, ${pending.merge.updated} updated.`,
        undefined,
        { duration: 4000 },
      );
    }
  }

  startEdit(entry: CatalogClass): void {
    this.editingId.set(entry.catalogueId);
    this.draftName.set(entry.name);
    this.draftAliases.set((entry.aliases ?? []).join(', '));
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  async saveEdit(entry: CatalogClass): Promise<void> {
    const name = normaliseWhitespace(this.draftName());
    if (!name) return;
    const updated: CatalogClass = { ...entry, name, aliases: splitAliases(this.draftAliases()) };
    const classes = this.store.classes().map(c => (c.catalogueId === entry.catalogueId ? updated : c));
    if (await this.save(classes)) this.editingId.set(null);
  }

  async addLocalClass(): Promise<void> {
    const name = normaliseWhitespace(this.newName());
    if (!name) return;
    const classes = this.store.classes();
    if (classes.some(c => normaliseClassName(c.name) === normaliseClassName(name))) {
      this.snackbar.open(`"${name}" is already in the catalogue.`, 'Dismiss', { duration: 4000 });
      return;
    }
    const entry: CatalogClass = {
      catalogueId: nextNegativeCatalogueId(classes),
      name,
      crew: Math.max(1, Math.round(this.newCrew() || 1)),
      aliases: splitAliases(this.newAliases()),
    };
    if (await this.save([...classes, entry])) {
      this.newName.set('');
      this.newAliases.set('');
      this.newCrew.set(1);
      this.snackbar.open(`Added "${name}" as ${entry.catalogueId}.`, undefined, { duration: 3000 });
    }
  }

  private async save(classes: CatalogClass[], ryaListVersion?: string): Promise<boolean> {
    this.busy.set(true);
    try {
      await this.store.save({
        classes,
        ryaListVersion: ryaListVersion ?? this.store.catalogue().ryaListVersion,
      });
      return true;
    } catch (e: unknown) {
      console.error('ClassCataloguePage: save failed', e);
      this.snackbar.open(e instanceof Error ? e.message : 'Could not save the catalogue.', 'Dismiss', {
        duration: 6000,
      });
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

function splitAliases(text: string): string[] {
  return [...new Set(text.split(',').map(a => normaliseWhitespace(a)).filter(Boolean))];
}
