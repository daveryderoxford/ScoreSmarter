import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { ListDetailLayout } from './list-detail-layout';

@Component({
  standalone: true,
  imports: [ListDetailLayout],
  template: `
    <app-list-detail-layout
      [detailOpen]="detailOpen()"
      [listCollapsed]="listCollapsed()"
      [listWidth]="listWidth">
      <div list data-testid="list">List</div>
      <div detail data-testid="detail">Detail</div>
    </app-list-detail-layout>
  `,
})
class HostComponent {
  readonly detailOpen = signal(false);
  readonly listCollapsed = signal(false);
  listWidth = '320px';
}

describe('ListDetailLayout', () => {
  const isWideLayout = signal(true);

  beforeEach(() => {
    isWideLayout.set(true);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: AppBreakpoints, useValue: { isWideLayout } }],
    });
  });

  function layoutEl(fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>): HTMLElement {
    return fixture.nativeElement.querySelector('app-list-detail-layout') as HTMLElement;
  }

  it('shows list and detail side by side on wide screens', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = layoutEl(fixture);
    expect(el.classList.contains('wide')).toBe(true);
    expect(el.classList.contains('compact')).toBe(false);
    expect(el.classList.contains('detail-open')).toBe(false);
    expect(getComputedStyle(el).getPropertyValue('--app-list-pane-width').trim()).toBe('320px');
    expect(el.querySelector('[data-testid="list"]')?.textContent).toContain('List');
    expect(el.querySelector('[data-testid="detail"]')?.textContent).toContain('Detail');
  });

  it('marks detail-open when a detail page is active', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.detailOpen.set(true);
    fixture.detectChanges();
    expect(layoutEl(fixture).classList.contains('detail-open')).toBe(true);
  });

  it('collapses the list column on wide screens', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.listCollapsed.set(true);
    fixture.detectChanges();
    expect(layoutEl(fixture).classList.contains('list-collapsed')).toBe(true);
  });

  it('does not collapse on compact screens', () => {
    isWideLayout.set(false);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.listCollapsed.set(true);
    fixture.detectChanges();
    const el = layoutEl(fixture);
    expect(el.classList.contains('compact')).toBe(true);
    expect(el.classList.contains('list-collapsed')).toBe(false);
  });
});
