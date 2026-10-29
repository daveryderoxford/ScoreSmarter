import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { computed, inject, Injectable, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Desktop and tablet landscape: wide page layouts (home, menu, results viewer).
 * Matches the Angular CDK tablet-landscape lower bound.
 */
export const WIDE_LAYOUT_MEDIA_QUERY = '(min-width: 960px)';

/**
 * Enough width for a list beside its detail: a 320px list, a 12px gutter and a
 * ~390px detail. Tablets in portrait qualify; phones do not. Width only, so the
 * same device switches with orientation only when the width allows.
 */
export const SPLIT_LAYOUT_MEDIA_QUERY = '(min-width: 720px)';

/** Which width a list/detail screen splits at. */
export type ListDetailBreakpoint = 'split' | 'wide';

@Injectable({
   providedIn: 'root'
})
export class AppBreakpoints {
   private readonly bp = inject(BreakpointObserver);

   private readonly handset = toSignal(this.bp.observe([Breakpoints.Handset]));
   private readonly coarsePointer = toSignal(this.bp.observe(['(pointer: coarse)']));
   private readonly wide = this.query(WIDE_LAYOUT_MEDIA_QUERY);
   private readonly split = this.query(SPLIT_LAYOUT_MEDIA_QUERY);

   /**
    * True mobile devices only:
    * - handset-sized layout
    * - coarse pointer (touch-first)
    *
    * This prevents desktop window resize from switching to mobile-only UX.
    */
   readonly isMobile = computed(() =>
      !!this.handset()?.matches && !!this.coarsePointer()?.matches
   );

   /** Desktop and tablet landscape (see {@link WIDE_LAYOUT_MEDIA_QUERY}). */
   readonly isWideLayout = computed(() => this.wide());

   /**
    * List and detail side by side (see {@link SPLIT_LAYOUT_MEDIA_QUERY}). Below this a
    * list screen navigates to a separate detail page.
    */
   readonly isSplitLayout = computed(() => this.split());

   /** Whether a list/detail screen using `breakpoint` shows list and detail together. */
   listDetailSplit(breakpoint: ListDetailBreakpoint): Signal<boolean> {
      return breakpoint === 'wide' ? this.isWideLayout : this.isSplitLayout;
   }

   private query(mediaQuery: string): Signal<boolean> {
      const state = toSignal(this.bp.observe(mediaQuery), {
         initialValue: { matches: this.bp.isMatched(mediaQuery), breakpoints: {} },
      });
      return computed(() => !!state().matches);
   }
}
