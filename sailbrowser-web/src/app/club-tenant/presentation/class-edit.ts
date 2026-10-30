import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DeleteButton } from 'app/shared/components/delete-button';
import { DetailHeading } from 'app/shared/layout/detail-heading';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { normaliseWhitespace } from 'app/shared/utils/string-utils';
import { ClubStore } from '../services/club-store';
import { ClassRenameService } from '../services/class-rename.service';
import { ClassForm } from './class-form/class-form';
import { BoatClass } from '../model/boat-class';

/** Detail fragment inside `ClassPage`. Do not wrap in `PageLayout`. */
@Component({
  selector: 'app-class-edit',
  imports: [ClassForm, DetailHeading, DeleteButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (boatClass(); as boatClass) {
      <app-detail-heading>{{ boatClass.name }}</app-detail-heading>
      @for (currentId of [id()]; track currentId) {
        <app-class-form [boatClass]="boatClass" (submitted)="submitted($event)" [busy]="busy()"></app-class-form>
      }
      <div class="delete-row">
        <app-delete-button [busy]="deleting()" (delete)="deleteClass(boatClass)">Delete class</app-delete-button>
      </div>
    }
  `,
  styles: `
    .delete-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 24px;
    }
  `,
})
export class ClassEdit {
  private cs = inject(ClubStore);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private dialogs = inject(DialogsService);
  private classRename = inject(ClassRenameService);

  id = input.required<string>();

  boatClass = computed(() => this.cs.club().classes.find(c => c.id === this.id()));

  busy = signal(false);
  deleting = signal(false);

  readonly form = viewChild(ClassForm);

  async submitted(data: Partial<BoatClass>) {
    try {
      this.busy.set(true);
      const oldClass = this.boatClass();
      if (oldClass) {
        const newClass: BoatClass = { ...oldClass, handicaps: data.handicaps! };
        if (data.pyOverridden !== undefined) newClass.pyOverridden = data.pyOverridden;
        if (data.isSinglehander !== undefined) newClass.isSinglehander = data.isSinglehander;
        if (data.name !== undefined) newClass.name = normaliseWhitespace(data.name);

        if (newClass.name !== oldClass.name) {
          newClass.formerNames = [...new Set([...(oldClass.formerNames ?? []), oldClass.name])];
          const plan = await this.classRename.plan(oldClass.name);
          const records = plan.boats.length + plan.seriesEntries.length;
          if (records > 0) {
            const ok = await this.dialogs.confirm(
              'Rename class?',
              `"${oldClass.name}" will be renamed to "${newClass.name}". ${plan.boats.length} boat(s) and ` +
                `${plan.seriesEntries.length} series entr${plan.seriesEntries.length === 1 ? 'y' : 'ies'} ` +
                'will be updated. Published results keep the old name.',
              { confirm: 'Rename' },
            );
            if (!ok) return;
            await this.classRename.apply(plan, newClass.name);
          }
        }

        await this.cs.updateClass(oldClass, newClass);
        this.router.navigate(["/club/classes"]);
      }
    } catch (error: unknown) {
      this.snackbar.open("Error encountered updating class", "Dismiss", { duration: 3000 });
      console.error('ClassEdit. Error updating class:', error);
    } finally {
      this.busy.set(false);
    }
  }

  async deleteClass(boatClass: BoatClass) {
    if (!await this.dialogs.confirm('Delete class?', `${boatClass.name} will be deleted.`, { confirm: 'Delete' })) return;
    try {
      this.deleting.set(true);
      await this.cs.removeClass(boatClass);
      this.form()?.form.markAsPristine();
      await this.router.navigate(['/club/classes']);
      this.snackbar.open("Class deleted", "Dismiss", { duration: 3000 });
    } catch (error: unknown) {
      this.snackbar.open("Error deleting class", "Dismiss", { duration: 3000 });
      console.error('Error deleting class:', error);
    } finally {
      this.deleting.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.form()?.canDeactivate() ?? true;
  }
}
