import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListPane } from './list-pane';

@Component({
  standalone: true,
  imports: [ListPane],
  template: `
    <app-list-pane [maxWidth]="maxWidth()">
      <div listHeader data-testid="header">Search</div>
      <span data-testid="body">Items</span>
    </app-list-pane>
  `,
})
class HostComponent {
  readonly maxWidth = signal<string | undefined>(undefined);
}

describe('ListPane', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
    });
  });

  function pane(fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>): HTMLElement {
    return fixture.nativeElement.querySelector('app-list-pane') as HTMLElement;
  }

  it('fills the parent when maxWidth is unset', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = pane(fixture);
    expect(el.classList.contains('constrained')).toBe(false);
    expect(el.querySelector('[data-testid="header"]')?.textContent).toContain('Search');
    expect(el.querySelector('[data-testid="body"]')?.textContent).toContain('Items');
  });

  it('constrains and centres the column when maxWidth is set', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.maxWidth.set('450px');
    fixture.detectChanges();
    const el = pane(fixture);
    expect(el.classList.contains('constrained')).toBe(true);
    expect(getComputedStyle(el).getPropertyValue('--app-list-pane-max-width').trim()).toBe('450px');
  });
});
