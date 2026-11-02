import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { EntryWizard } from '../entry-wizard/entry-wizard';
import { FakeEntryWizard } from '../entry-wizard/entry-wizard.testing';
import { EntryPage } from './entry-page';

describe('EntryPage', () => {
  function render(queryParams: Record<string, string> = {}) {
    const navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      imports: [EntryPage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (key: string) => queryParams[key] ?? null } } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    TestBed.overrideComponent(EntryPage, {
      remove: { imports: [EntryWizard] },
      add: { imports: [FakeEntryWizard] },
    });
    const fixture = TestBed.createComponent(EntryPage);
    fixture.detectChanges();
    const wizard = fixture.debugElement.query(By.directive(FakeEntryWizard)).componentInstance as FakeEntryWizard;
    return { fixture, wizard, navigate };
  }

  it('passes the race and boat query params to the wizard', () => {
    const { wizard } = render({ raceId: 'r1', boatClass: 'ILCA 7', sailNumber: '1234' });
    expect(wizard.scopedRaceId()).toBe('r1');
    expect(wizard.initialBoatClass()).toBe('ILCA 7');
    expect(wizard.initialSailNumber()).toBe('1234');
  });

  it('returns to the entries list once entered', () => {
    const { wizard, navigate } = render();
    wizard.entered.emit({ races: [] });
    expect(navigate).toHaveBeenCalledWith(['entry', 'entries']);
  });

  it('blocks navigation while the wizard has unsaved changes', () => {
    const { fixture, wizard } = render();
    expect(fixture.componentInstance.canDeactivate()).toBe(true);
    wizard.dirty.set(true);
    expect(fixture.componentInstance.canDeactivate()).toBe(false);
  });
});
