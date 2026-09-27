import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { DialogsService } from '../dialogs/dialogs.service';
import {
  ComponentCanDeactivate,
  pendingChangesGuard,
} from './pending-changes-guard-service.guard';

const route = {} as ActivatedRouteSnapshot;
const state = { url: '/boats' } as RouterStateSnapshot;

function runGuard(component: ComponentCanDeactivate) {
  return TestBed.runInInjectionContext(() =>
    pendingChangesGuard(component, route, state, state),
  );
}

describe('pendingChangesGuard', () => {
  it('allows navigation without a prompt when the form is clean', async () => {
    const confirm = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: DialogsService, useValue: { confirm } }],
    });

    await expect(runGuard({ canDeactivate: () => true })).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('resets dirty state after the user confirms discard', async () => {
    const discardChanges = vi.fn();
    TestBed.configureTestingModule({
      providers: [{
        provide: DialogsService,
        useValue: { confirm: vi.fn().mockResolvedValue(true) },
      }],
    });

    await expect(runGuard({
      canDeactivate: () => false,
      discardChanges,
    })).resolves.toBe(true);
    expect(discardChanges).toHaveBeenCalledOnce();
  });

  it('leaves edits in place when the user cancels', async () => {
    const discardChanges = vi.fn();
    TestBed.configureTestingModule({
      providers: [{
        provide: DialogsService,
        useValue: { confirm: vi.fn().mockResolvedValue(false) },
      }],
    });

    await expect(runGuard({
      canDeactivate: () => false,
      discardChanges,
    })).resolves.toBe(false);
    expect(discardChanges).not.toHaveBeenCalled();
  });
});
