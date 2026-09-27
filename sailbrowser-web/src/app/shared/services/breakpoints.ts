import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Desktop and tablet landscape. Below this, list/detail layouts stack
 * (list screen navigates to a separate detail page).
 * Matches the Angular CDK tablet-landscape lower bound.
 */
export const WIDE_LAYOUT_MEDIA_QUERY = '(min-width: 960px)';

@Injectable({
   providedIn: 'root'
})
export class AppBreakpoints {
   private readonly bp = inject(BreakpointObserver);

   private readonly handset = toSignal(this.bp.observe([Breakpoints.Handset]));
   private readonly coarsePointer = toSignal(this.bp.observe(['(pointer: coarse)']));
   private readonly wide = toSignal(
      this.bp.observe(WIDE_LAYOUT_MEDIA_QUERY),
      {
         initialValue: {
            matches: this.bp.isMatched(WIDE_LAYOUT_MEDIA_QUERY),
            breakpoints: {},
         },
      },
   );

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

   /**
    * Split list/detail (desktop and tablet landscape).
    * Compact (phone and tablet portrait) uses a list screen that navigates
    * to a separate detail page.
    */
   readonly isWideLayout = computed(() => !!this.wide()?.matches);
}