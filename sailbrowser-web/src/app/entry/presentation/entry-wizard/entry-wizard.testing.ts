import { Component, forwardRef, input, output, signal } from '@angular/core';
import { EntryWizard, type EntryWizardResult } from './entry-wizard';

/** Stands in for `EntryWizard` in host specs; `viewChild(EntryWizard)` resolves to it. */
@Component({
  selector: 'app-entry-wizard',
  template: '',
  providers: [{ provide: EntryWizard, useExisting: forwardRef(() => FakeEntryWizard) }],
})
export class FakeEntryWizard {
  readonly scopedRaceId = input<string>();
  readonly scopedSeriesId = input<string>();
  readonly initialBoatClass = input<string>();
  readonly initialSailNumber = input<string>();
  readonly oodHelm = input<string>();
  readonly initialSearch = input<string>();
  readonly entered = output<EntryWizardResult>();

  readonly dirty = signal(false);

  isDirty(): boolean {
    return this.dirty();
  }
}
