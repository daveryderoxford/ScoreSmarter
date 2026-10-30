import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, expect, it } from 'vitest';
import { ClubStore } from 'app/club-tenant';
import type { Fleet } from 'app/club-tenant/model/fleet';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import type { Series } from '../model/series';
import { RaceCalendarStore } from '../services/full-race-calander';
import { SeriesForm } from './series-form';

const general: Fleet = { type: 'GeneralHandicap', id: 'general-handicap', name: 'General Handicap' };
/** A fleet the club no longer offers (e.g. a tag fleet from before divisions). */
const youthTag = { type: 'Tag', id: 'youth', name: 'Youth', value: 'Youth' } as unknown as Fleet;

const wednesday: Series = {
  id: 's-wed',
  seasonId: '2526',
  name: 'Wednesday',
  archived: false,
  scoringAlgorithm: 'long',
  entryAlgorithm: 'helm',
  discards: [],
  primaryScoringConfiguration: { id: 'overall', name: 'PY', type: 'Handicap', fleet: general, handicapScheme: 'PY' },
  secondaryScoringConfigurations: [
    { id: 'cfg-youth', name: 'Youth', type: 'Handicap', fleet: youthTag, handicapScheme: 'PY' },
  ],
} as Series;

function render(series: Series | undefined, otherSeries: Partial<Series>[] = []) {
  TestBed.configureTestingModule({
    imports: [SeriesForm],
    providers: [
      {
        provide: ClubStore,
        useValue: {
          club: signal({ seasons: [{ id: '2526', name: '2025-26' }], fleets: [general], supportedHandicapSchemes: ['PY'] }),
        },
      },
      { provide: RaceCalendarStore, useValue: { allSeries: signal(otherSeries), allRaces: signal([]) } },
      { provide: DialogsService, useValue: {} },
      { provide: MatSnackBar, useValue: { open: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SeriesForm);
  fixture.componentRef.setInput('series', series);
  fixture.detectChanges();
  const saved: Series[] = [];
  fixture.componentInstance.save.subscribe(s => saved.push(s));
  return { fixture, form: fixture.componentInstance, saved };
}

describe('SeriesForm', () => {
  it('loads a scoring row whose fleet is no longer offered as invalid, and shows why', () => {
    const { form } = render(wednesday);
    const fleet = form.secondaryConfigs.at(0).get('fleetId')!;
    expect(fleet.value).toBe('');
    expect(fleet.touched).toBe(true);
    expect(form.form.invalid).toBe(true);
  });

  it('saves the display group', async () => {
    const { form, saved } = render({ ...wednesday, secondaryScoringConfigurations: [] });
    form.form.controls.displayGroup.setValue('Saturday and Wednesday');
    await form.onSubmit();
    expect(saved[0].displayGroup).toBe('Saturday and Wednesday');
  });

  it('shows the fields that need fixing when a loaded series is invalid', () => {
    const broken = {
      ...wednesday,
      secondaryScoringConfigurations: [{ id: 'cfg-x', name: 'PY', type: 'Handicap', handicapScheme: 'PY' }],
    } as unknown as Series;
    const { form } = render(broken);
    expect(form.form.invalid).toBe(true);
    expect(form.secondaryConfigs.at(0).get('fleetId')?.touched).toBe(true);
  });

  it('suggests display groups already used in the race calendar', () => {
    const { fixture, form } = render(undefined, [{ displayGroup: 'Opens' }, { displayGroup: 'Cups' }, {}]);
    form.form.controls.displayGroup.setValue('o');
    fixture.detectChanges();
    expect((form as unknown as { displayGroupOptions: () => string[] }).displayGroupOptions()).toEqual(['Opens']);
  });
});
