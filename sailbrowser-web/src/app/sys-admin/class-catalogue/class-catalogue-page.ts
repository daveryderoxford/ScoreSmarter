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
import { currentPn } from 'app/club-tenant/model/club-class';
import {
  mergeRyaClassList,
  parseRyaClassList,
  pyRatingsFromRyaList,
  type PyRatingsImport,
  type RyaMergeResult,
} from 'app/club-tenant/model/rya-class-list';
import type { RatingList } from 'app/club-tenant/model/rating-list';
import { ClassCatalogueStore } from 'app/club-tenant/services/class-catalogue-store';
import { RatingListStore } from 'app/club-tenant/services/rating-list-store';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { Toolbar } from 'app/shared/components/toolbar';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import { PageLayout } from 'app/shared/layout/page-layout';

interface PendingImport {
  fileName: string;
  merge: RyaMergeResult;
  errors: string[];
}

interface PendingPyList extends PyRatingsImport {
  fileName: string;
}

const MAX_DIFFERENCES_SHOWN = 20;

/** `YYYY-MM-DD` for a date input, in local time. */
function dateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Sys-admin maintenance of the global class catalogue (RYA class list import, names,
 * aliases, non-RYA classes) and the published, dated PY lists.
 */
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
  protected readonly ratingLists = inject(RatingListStore);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialogs = inject(DialogsService);

  protected readonly maxDifferencesShown = MAX_DIFFERENCES_SHOWN;

  protected readonly isRyaClass = isRyaClass;

  readonly search = signal('');
  readonly busy = signal(false);
  readonly pendingImport = signal<PendingImport | null>(null);
  readonly listVersion = signal('');

  readonly pendingPyList = signal<PendingPyList | null>(null);
  readonly pyListName = signal('');
  readonly pyEffectiveFrom = signal(dateInputValue(new Date()));
  protected readonly pyEffectiveInPast = computed(() => this.pyEffectiveFrom() < dateInputValue(new Date()));

  /** Published lists, newest first. */
  readonly publishedLists = computed(() =>
    [...this.ratingLists.lists()].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()),
  );

  constructor() {
    this.ratingLists.preload();
  }

  protected currentPn(entry: CatalogClass): number | undefined {
    return currentPn(this.ratingLists.lists(), entry.catalogueId);
  }

  protected ratingCount(list: Pick<RatingList, 'ratings'>): number {
    return Object.keys(list.ratings).length;
  }

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
        `RYA class list imported: ${pending.merge.added} added.`,
        undefined,
        { duration: 4000 },
      );
    }
  }

  async onPyFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const result = pyRatingsFromRyaList(parseRyaClassList(await file.text()), this.store.classes());
    if (Object.keys(result.ratings).length === 0) {
      this.snackbar.open(result.errors[0] ?? 'No PNs found in the file.', 'Dismiss', { duration: 6000 });
      return;
    }
    this.pendingPyList.set({ ...result, fileName: file.name });
  }

  cancelPyList(): void {
    this.pendingPyList.set(null);
  }

  async savePyList(): Promise<void> {
    const pending = this.pendingPyList();
    const name = normaliseWhitespace(this.pyListName());
    const day = this.pyEffectiveFrom();
    if (!pending || !name || !day) return;
    const effectiveFrom = new Date(`${day}T00:00:00`);
    if (this.ratingLists.lists().some(l => l.scheme === 'PY' && dateInputValue(l.effectiveFrom) === day)) {
      this.snackbar.open('A PY list already takes effect on that date.', 'Dismiss', { duration: 5000 });
      return;
    }
    this.busy.set(true);
    try {
      await this.ratingLists.add({ scheme: 'PY', issuer: 'RYA', name, effectiveFrom, ratings: pending.ratings });
      this.pendingPyList.set(null);
      this.pyListName.set('');
      this.snackbar.open(`${name} published.`, undefined, { duration: 4000 });
    } catch (e: unknown) {
      console.error('ClassCataloguePage: saving PY list failed', e);
      this.snackbar.open(e instanceof Error ? e.message : 'Could not save the PY list.', 'Dismiss', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }

  async deleteList(list: RatingList): Promise<void> {
    const ok = await this.dialogs.confirm(
      'Delete PY list?',
      `${list.name} will be deleted. Entries made from now on use the previous list, or the club's own PY.`,
      { confirm: 'Delete' },
    );
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.ratingLists.remove(list.id);
    } catch (e: unknown) {
      console.error('ClassCataloguePage: deleting PY list failed', e);
      this.snackbar.open('Could not delete the PY list.', 'Dismiss', { duration: 6000 });
    } finally {
      this.busy.set(false);
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
