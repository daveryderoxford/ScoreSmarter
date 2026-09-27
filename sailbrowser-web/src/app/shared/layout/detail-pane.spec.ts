import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppBreakpoints } from 'app/shared/services/breakpoints';
import { DetailPane } from './detail-pane';

@Component({
  standalone: true,
  imports: [DetailPane],
  template: `
    <app-detail-pane
      [scrollable]="scrollable()"
      [frameContent]="frameContent()"
      [maxWidth]="maxWidth">
      <span data-testid="body">Form</span>
    </app-detail-pane>
  `,
})
class HostComponent {
  readonly scrollable = signal(true);
  readonly frameContent = signal(true);
  maxWidth = '350px';
}

describe('DetailPane', () => {
  const isWideLayout = signal(true);

  beforeEach(() => {
    isWideLayout.set(true);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: AppBreakpoints, useValue: { isWideLayout } }],
    });
  });

  function pane(fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>): HTMLElement {
    return fixture.nativeElement.querySelector('app-detail-pane') as HTMLElement;
  }

  it('frames and constrains form content on wide screens', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = pane(fixture);
    expect(el.classList.contains('wide')).toBe(true);
    expect(el.classList.contains('framed')).toBe(true);
    expect(el.classList.contains('scrollable')).toBe(true);
    expect(getComputedStyle(el).getPropertyValue('--app-detail-max-width').trim()).toBe('350px');
    expect(el.querySelector('[data-testid="body"]')?.textContent).toContain('Form');
  });

  it('uses compact class on narrow screens', () => {
    isWideLayout.set(false);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = pane(fixture);
    expect(el.classList.contains('compact')).toBe(true);
    expect(el.classList.contains('wide')).toBe(false);
  });

  it('can disable scrolling', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.scrollable.set(false);
    fixture.detectChanges();
    expect(pane(fixture).classList.contains('scrollable')).toBe(false);
  });

  it('can disable form framing for full-width detail', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.frameContent.set(false);
    fixture.detectChanges();
    const el = pane(fixture);
    expect(el.classList.contains('framed')).toBe(false);
    expect(getComputedStyle(el).backgroundColor).toBe('var(--mat-sys-surface)');
  });
});
