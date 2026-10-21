import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';
import { DialogsService } from '../dialogs/dialogs.service';

export interface ComponentCanDeactivate {
  canDeactivate: () => Observable<boolean> | Promise<boolean> | boolean;
  /** Restore saved values and clear dirty state after the user confirms discard. */
  discardChanges?: () => void;
}

export const pendingChangesGuard: CanDeactivateFn<ComponentCanDeactivate> = async (
  component: ComponentCanDeactivate,
) => {
  const ds = inject(DialogsService);
  if (component.canDeactivate()) {
    return true;
  }

  const confirmed = await ds.confirm(
    'Discard changes?',
    'You have unsaved changes. If you leave now, your progress will be lost.',
    { confirm: 'Discard changes', cancel: 'Keep editing' },
  );
  if (confirmed) {
    component.discardChanges?.();
  }
  return !!confirmed;
};
