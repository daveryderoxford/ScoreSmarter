import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClubStore } from 'app/club-tenant';
import { Race } from 'app/race-calender';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceCompetitor } from '../../../model/race-competitor';
import { ResolvedRaceCompetitor } from '../../../model/resolved-race-competitor';
import { SeriesEntry } from '../../../model/series-entry';
import { ManualResultsService } from '../../../services/manual-results.service';
import { RaceCompetitorEditService } from '../../../services/race-competitor-edit.service';
import { DialogsService } from 'app/shared/dialogs/dialogs.service';
import { HandicapInputPanel } from './handicap-input-panel';

const start = new Date(2026, 5, 10, 10, 0, 0);

function competitor(id: string, helm: string, laps: number, finish: Date): ResolvedRaceCompetitor {
  return new ResolvedRaceCompetitor(
    new RaceCompetitor({
      id,
      raceId: 'race-1',
      seriesId: 'series-1',
      seriesEntryId: `entry-${id}`,
      startTime: start,
      manualFinishTime: finish,
      manualLaps: laps,
      resultCode: 'OK',
    }),
    {
      id: `entry-${id}`,
      seriesId: 'series-1',
      helm,
      boatClass: 'ILCA 7',
      sailNumber: id,
      handicaps: [{ scheme: 'PY', value: 1100 }],
      divisions: [],
    } satisfies SeriesEntry,
  );
}

const alice = competitor('a', 'Alice', 3, new Date(2026, 5, 10, 14, 32, 5, 400));
const bob = competitor('b', 'Bob', 2, new Date(2026, 5, 10, 14, 40, 0));

const race = {
  id: 'race-1',
  actualStart: start,
  scheduledStart: start,
  timeInputMode: 'tod',
  type: 'Handicap',
} as Race;

describe('HandicapInputPanel competitor switch', () => {
  let promptUnsavedChanges: ReturnType<typeof vi.fn>;
  let recordResult: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    promptUnsavedChanges = vi.fn(async () => 'discard');
    recordResult = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      imports: [HandicapInputPanel],
      providers: [
        { provide: DialogsService, useValue: { promptUnsavedChanges } },
        { provide: ManualResultsService, useValue: { calculateStats: () => null, recordResult } },
        { provide: ClubStore, useValue: { club: () => ({ classes: [] }) } },
        { provide: RaceCompetitorEditService, useValue: {} },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(HandicapInputPanel);
    fixture.componentRef.setInput('race', race);
    fixture.componentRef.setInput('competitors', [alice, bob]);
    fixture.componentRef.setInput('handicapScheme', 'PY');
    fixture.componentRef.setInput('selectedCompetitor', alice);
    fixture.detectChanges();
    return fixture;
  }

  function lapsInput(root: HTMLElement): HTMLInputElement {
    const laps = [...root.querySelectorAll('input')].find(input =>
      !input.closest('app-race-time-input') && input.getAttribute('placeholder') !== 'Class, Sail No or Helm',
    );
    if (!laps) throw new Error('laps input missing');
    return laps;
  }

  it('does not warn when time or laps were focused but not changed', async () => {
    const fixture = render();
    const panel = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const time = root.querySelector('app-race-time-input input') as HTMLInputElement;
    const laps = lapsInput(root);
    const finish = panel.form.controls.finishTime.value;

    time.dispatchEvent(new Event('blur'));
    laps.dispatchEvent(new Event('input', { bubbles: true }));
    laps.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(panel.form.controls.finishTime.value).toBe(finish);
    expect(panel.form.controls.laps.value).toBe(3);
    expect(panel.form.dirty).toBe(false);

    await panel.setSelectedCompetitor(bob);

    expect(promptUnsavedChanges).not.toHaveBeenCalled();
    expect(panel.selectedCompetitor()?.id).toBe('b');
  });

  it('warns when laps were actually changed before switching', async () => {
    const fixture = render();
    const panel = fixture.componentInstance;
    const laps = lapsInput(fixture.nativeElement as HTMLElement);
    laps.value = '4';
    laps.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(panel.form.controls.laps.value).toBe(4);
    expect(panel.form.dirty).toBe(true);

    await panel.setSelectedCompetitor(bob);

    expect(promptUnsavedChanges).toHaveBeenCalledOnce();
    expect(panel.selectedCompetitor()?.id).toBe('b');
  });

  it('moves on without rewriting the result when Done is pressed with nothing changed', async () => {
    const fixture = render();
    const panel = fixture.componentInstance;
    const laps = lapsInput(fixture.nativeElement as HTMLElement);
    expect(laps.getAttribute('enterkeyhint')).toBe('done');

    laps.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();

    expect(recordResult).not.toHaveBeenCalled();
    expect(panel.selectedCompetitor()).toBeUndefined();
  });

  it('saves when Done is pressed after a change, and enables Save only then', async () => {
    const fixture = render();
    const panel = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const saveButton = () => root.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(saveButton().disabled).toBe(true);

    const laps = lapsInput(root);
    laps.value = '4';
    laps.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(saveButton().disabled).toBe(false);

    laps.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();

    expect(recordResult).toHaveBeenCalledOnce();
    expect(recordResult.mock.calls[0][2]).toMatchObject({ laps: 4 });
    expect(panel.selectedCompetitor()).toBeUndefined();
  });
});
