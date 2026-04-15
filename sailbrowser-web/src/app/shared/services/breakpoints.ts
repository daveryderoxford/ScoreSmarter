import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
   providedIn: 'root'
})
export class AppBreakpoints {
   private readonly bp = inject(BreakpointObserver);

   private readonly handset = toSignal(this.bp.observe([Breakpoints.Handset]));
   private readonly coarsePointer = toSignal(this.bp.observe(['(pointer: coarse)']));

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
}