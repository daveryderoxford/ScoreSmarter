import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { PublishedSeason, SeriesInfo } from 'app/published-results/model/published-season';
import { SeasonList } from './season-list';

const info = (id: string, displayGroup?: string): SeriesInfo => ({
  id, name: `Series ${id}`, fleetId: 'f', startDate: new Date('2026-04-01'), endDate: new Date('2026-05-01'), raceCount: 1,
  ...(displayGroup ? { displayGroup } : {}),
});

function render(seasons: PublishedSeason[]) {
  TestBed.configureTestingModule({ imports: [SeasonList], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(SeasonList);
  fixture.componentRef.setInput('seasons', seasons);
  fixture.detectChanges();
  const component = fixture.componentInstance as unknown as {
    displayGroupFilter: { set(value: string): void };
  };
  const names = () => [...fixture.nativeElement.querySelectorAll('[matListItemTitle]')].map((e: Element) => e.textContent?.trim());
  return { fixture, component, names };
}

describe('SeasonList', () => {
  const seasons: PublishedSeason[] = [
    { id: '2026', name: '2026', series: [info('a', 'Opens'), info('b', 'Cups'), info('c')] },
  ];

  it('shows every series for All and only the group selected otherwise', async () => {
    const { fixture, component, names } = render(seasons);
    await fixture.whenStable();
    expect(names()).toHaveLength(3);

    component.displayGroupFilter.set('Opens');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(names()).toEqual(['Series a']);
  });

  it('shows the group filter only when a series has a group', () => {
    expect(render(seasons).fixture.nativeElement.querySelector('mat-select')).not.toBeNull();
    TestBed.resetTestingModule();
    const ungrouped = [{ id: '2026', name: '2026', series: [info('c')] }];
    expect(render(ungrouped).fixture.nativeElement.querySelector('mat-select')).toBeNull();
  });
});
