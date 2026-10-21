import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { FirestoreTenantService } from 'app/club-tenant';
import { PublishedResultsReader } from 'app/published-results/services/published-results-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportResultsDialog } from './export-results-dialog';

const seasons = [
  {
    id: 'season-a',
    name: '2025-26',
    series: [
      { id: 's1', name: 'Summer AM', fleetId: 'gh', startDate: new Date(), endDate: new Date(), raceCount: 2 },
      { id: 's2', name: 'Summer PM', fleetId: 'gh', startDate: new Date(), endDate: new Date(), raceCount: 1 },
    ],
  },
];

describe('ExportResultsDialog', () => {
  let close: ReturnType<typeof vi.fn>;
  let getSeriesWithRaces: ReturnType<typeof vi.fn>;

  function render() {
    TestBed.configureTestingModule({
      imports: [ExportResultsDialog],
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        { provide: FirestoreTenantService, useValue: {} },
        {
          provide: PublishedResultsReader,
          useValue: {
            seasons: signal(seasons),
            seasonsLoading: signal(false),
            seasonsError: signal(null),
            getSeriesWithRaces,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ExportResultsDialog);
    fixture.detectChanges();
    const dialog = fixture.componentInstance as unknown as {
      selected: WritableSignal<ReadonlySet<string>>;
      canExport(): boolean;
      export(): Promise<void>;
    };
    return { fixture, dialog };
  }

  beforeEach(() => {
    close = vi.fn();
    getSeriesWithRaces = vi.fn(async (id: string) => ({
      series: { id, name: id === 's1' ? 'Summer AM' : 'Summer PM', fleetId: 'gh', competitors: [], divisionDefinitions: [] },
      races: [
        {
          id: `r-${id}`,
          seriesName: 'Summer',
          index: 1,
          seriesId: id,
          raceOfDay: 1,
          scheduledStart: new Date('2026-06-10T11:00:00'),
          type: 'Handicap',
          isDiscardable: true,
          isAverageLap: false,
          results: [
            {
              seriesEntryId: 'e1',
              competitorKey: 'e1',
              rank: 1,
              helm: 'Alex',
              boatClass: 'ILCA 7',
              sailNumber: '1',
              club: 'IBRSC',
              handicap: 1100,
              laps: 1,
              startTime: new Date('2026-06-10T11:00:00'),
              finishTime: new Date('2026-06-10T11:30:00'),
              elapsedTime: 1800,
              correctedTime: 1600,
              points: 1,
              resultCode: 'OK',
              divisions: [],
            },
          ],
          divisionDefinitions: [],
        },
      ],
    }));
  });

  it('lists published series from seasons', () => {
    const { fixture } = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('2025-26');
    expect(text).toContain('Summer AM');
    expect(text).toContain('Summer PM');
  });

  it('disables export until a series is selected', () => {
    const { dialog } = render();
    expect(dialog.canExport()).toBe(false);
    dialog.selected.set(new Set(['s1']));
    expect(dialog.canExport()).toBe(true);
  });

  it('exports the selected series and closes with csv', async () => {
    const { dialog } = render();
    dialog.selected.set(new Set(['s1', 's2']));
    await dialog.export();

    expect(getSeriesWithRaces).toHaveBeenCalledWith('s1');
    expect(getSeriesWithRaces).toHaveBeenCalledWith('s2');
    expect(close).toHaveBeenCalledTimes(1);
    const result = close.mock.calls[0]![0] as { csv: string; filename: string };
    expect(result.filename).toMatch(/^results-export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.csv).toContain('Alex');
    expect(result.csv).toContain('Summer AM');
  });
});
