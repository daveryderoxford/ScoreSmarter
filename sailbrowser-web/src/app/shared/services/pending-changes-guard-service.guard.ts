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
    ' Unsaved changes',
    'You have unsaved changes.  \n Press Cancel to go back and save these changes, or OK to lose these changes.',
  );
  if (confirmed) {
    component.discardChanges?.();
  }
  return !!confirmed;
};
