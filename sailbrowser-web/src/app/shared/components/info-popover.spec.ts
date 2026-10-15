import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InfoPopover } from './info-popover';

@Component({
  imports: [InfoPopover],
  template: `<app-info-popover label="Race information" (opened)="openCount = openCount + 1"><span class="content">Wind: SW 10</span></app-info-popover>`,
})
class Host {
  openCount = 0;
}

describe('InfoPopover', () => {
  let fixture: ComponentFixture<Host>;
  let trigger: HTMLButtonElement;

  const panel = () => document.querySelector('.info-popover-panel');
  const settle = () => fixture.detectChanges();

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    settle();
    trigger = fixture.nativeElement.querySelector('button');
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('labels the trigger and starts closed', () => {
    expect(trigger.getAttribute('aria-label')).toBe('Race information');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('shows the content on hover and hides it after the pointer leaves', () => {
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    settle();
    expect(panel()?.textContent).toContain('Wind: SW 10');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(200);
    settle();
    expect(panel()).toBeNull();
  });

  it('stays open after a click until clicked again', () => {
    trigger.click();
    settle();
    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(200);
    settle();
    expect(panel()).not.toBeNull();

    trigger.click();
    settle();
    expect(panel()).toBeNull();
  });

  it('closes when clicking elsewhere on the page', () => {
    trigger.click();
    settle();
    expect(panel()).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    settle();
    expect(panel()).toBeNull();
  });

  it('reports each opening once', () => {
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    trigger.click();
    settle();
    expect(fixture.componentInstance.openCount).toBe(1);

    trigger.click();
    trigger.click();
    settle();
    expect(fixture.componentInstance.openCount).toBe(2);
  });

  it('closes on Escape', () => {
    trigger.click();
    settle();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    settle();
    expect(panel()).toBeNull();
  });
});
