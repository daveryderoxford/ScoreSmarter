import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from 'app/auth/auth.service';
import { ClubStore } from 'app/club-tenant';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { CurrentRaces } from 'app/results-input';
import { CenteredText } from 'app/shared/components/centered-text';
import { LoadingCentered } from 'app/shared/components/loading-centered';
import { Toolbar } from 'app/shared/components/toolbar';
import { TodaysPublishedRacesService } from '../../services/todays-published-races.service';
import { RaceResultsTable } from '../results-tables/race-results-table/race-results-table';

/** Vertical scroll speed when reading downward (px per second). */
const READ_SCROLL_PX_PER_SEC = 34;
/** Slightly faster return to the top so the cycle does not feel sluggish. */
const RETURN_SCROLL_PX_PER_SEC = 62;
/** Time to read the bottom of the list before scrolling back up. */
const PAUSE_AT_BOTTOM_MS = 1625;
/** Time at the top before starting the next downward pass. */
const PAUSE_AT_TOP_MS = 1125;
/** Minimum overflow (px) before kiosk scrolling runs. */
const OVERFLOW_THRESHOLD_PX = 12;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const t = window.setTimeout(() => {
      if (signal.aborted) reject(new DOMException('aborted', 'AbortError'));
      else resolve();
    }, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

@Component({
  selector: 'app-todays-results-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TodaysPublishedRacesService],
  imports: [
    Toolbar,
    MatButtonModule,
    MatSlideToggleModule,
    RouterLink,
    DatePipe,
    LoadingCentered,
    CenteredText,
    RaceResultsTable,
  ],
  templateUrl: './todays-results-page.html',
  styleUrl: './todays-results-page.scss',
})
export class TodaysResultsPage {
  private readonly todayRaces = inject(TodaysPublishedRacesService);
  private readonly clubStore = inject(ClubStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  protected readonly auth = inject(AuthService);
  private readonly currentRaces = inject(CurrentRaces);

  private readonly scrollHost = viewChild<ElementRef<HTMLElement>>('scrollHost');

  /** User-controlled kiosk scrolling (toolbar slide toggle). */
  protected readonly autoScrollEnabled = signal(false);

  protected readonly loading = this.todayRaces.loading;
  protected readonly blocks = this.todayRaces.blocks;
  protected readonly loadError = this.todayRaces.loadError;

  /** Recomputes when results update so the heading stays correct around midnight. */
  protected readonly headingDate = computed(() => {
    void this.todayRaces.blocks().length;
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  });

  protected readonly isEmpty = computed(
    () => !this.loading() && !this.loadError() && this.blocks().length === 0,
  );

  /** Slide toggle disabled when auto-scroll cannot run meaningfully. */
  protected readonly autoScrollToggleDisabled = computed(
    () =>
      this.loading() ||
      !!this.loadError() ||
      this.isEmpty() ||
      prefersReducedMotion(),
  );

  constructor() {
    // Turn kiosk mode off when the page can no longer support it (e.g. data reload → loading).
    effect(() => {
      if (this.autoScrollToggleDisabled() && this.autoScrollEnabled()) {
        this.autoScrollEnabled.set(false);
      }
    });

    // Only start/stop the loop when the user toggles auto-scroll or data availability changes.
    // Intentionally does not read `blocks()` deeply so Firestore/array reference churn does not abort mid-loop.
    effect(onCleanup => {
      if (!this.autoScrollEnabled() || this.autoScrollToggleDisabled()) {
        return;
      }

      const ac = new AbortController();
      onCleanup(() => ac.abort());

      afterNextRender(
        () => {
          if (ac.signal.aborted) return;
          const host = this.scrollHost()?.nativeElement;
          if (!host) return;

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (ac.signal.aborted) return;
              void this.runReadThenReturnLoop(host, ac.signal);
            });
          });
        },
        { injector: this.injector },
      );
    });
  }

  protected onAutoScrollToggle(checked: boolean): void {
    this.autoScrollEnabled.set(checked);
  }

  fleetLabel(fleetId: string): string {
    const fleet = this.clubStore.club().fleets.find(f => f.id === fleetId);
    return fleet ? getFleetName(fleet) : fleetId;
  }

  openInViewer(seriesId: string, raceId: string): void {
    void this.router.navigate(['/results/viewer', seriesId], { queryParams: { raceId } });
  }

  editRace(raceId: string): void {
    this.currentRaces.addRaceId(raceId);
    void this.router.navigate(['/results-input/manual'], { queryParams: { raceId } });
  }

  /**
   * Slowly scrolls through overflow content, pauses at the bottom, scrolls
   * back to the top, pauses, then repeats until aborted (navigation, data
   * reload, or reduced-motion).
   */
  private async runReadThenReturnLoop(el: HTMLElement, signal: AbortSignal): Promise<void> {
    try {
      while (!signal.aborted) {
        const max = el.scrollHeight - el.clientHeight;
        if (max <= OVERFLOW_THRESHOLD_PX) return;

        el.scrollTop = 0;
        await this.animateScroll(el, 0, max, READ_SCROLL_PX_PER_SEC, signal);
        await sleep(PAUSE_AT_BOTTOM_MS, signal);
        await this.animateScroll(el, el.scrollTop, 0, RETURN_SCROLL_PX_PER_SEC, signal);
        await sleep(PAUSE_AT_TOP_MS, signal);
      }
    } catch {
      /* AbortError: user left, refreshed, or interrupted scrolling */
    }
  }

  private animateScroll(
    el: HTMLElement,
    from: number,
    to: number,
    pxPerSec: number,
    signal: AbortSignal,
  ): Promise<void> {
    const distance = Math.abs(to - from);
    if (distance < 2) return Promise.resolve();
    const durationMs = Math.max((distance / pxPerSec) * 1000, 600);
    const startTime = performance.now();
    el.scrollTop = from;

    return new Promise((resolve, reject) => {
      const frame = (now: number) => {
        if (signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        const t = Math.min(1, (now - startTime) / durationMs);
        el.scrollTop = from + (to - from) * t;
        if (t >= 1) {
          el.scrollTop = to;
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
    });
  }
}
