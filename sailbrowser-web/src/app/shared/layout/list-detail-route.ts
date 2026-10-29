import { computed, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { AppBreakpoints, ListDetailBreakpoint } from 'app/shared/services/breakpoints';
import { filter, map, startWith } from 'rxjs';

/** The detail child route open under a list/detail page (`add` or `edit/:id`). */
export type ListDetailSelection = { kind: 'add' } | { kind: 'edit'; id: string } | undefined;

export interface ListDetailRoute {
  /** The open detail, or undefined when only the list (and placeholder) shows. */
  selection: Signal<ListDetailSelection>;
  detailOpen: Signal<boolean>;
  /** Id of the item being edited, for highlighting it in the list. */
  selectedId: Signal<string | null>;
  /** True when list and detail are side by side. */
  isSplit: Signal<boolean>;
  /** True when the detail has the screen to itself, so the toolbar shows Back. */
  showBack: Signal<boolean>;
}

/**
 * Route state for a list/detail page whose children are `''` (placeholder), `add`
 * and `edit/:id`. Call from a field initializer of the page component, and pass
 * the same `breakpoint` as its `ListDetailLayout`.
 */
export function listDetailRoute(breakpoint: ListDetailBreakpoint = 'split'): ListDetailRoute {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const isSplit = inject(AppBreakpoints).listDetailSplit(breakpoint);

  const url = toSignal(
    router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => router.url),
      startWith(router.url),
    ),
    { initialValue: router.url },
  );

  const selection = computed<ListDetailSelection>(() => {
    url();
    const child = route.firstChild;
    const path = child?.snapshot.url[0]?.path;
    if (path === 'add') return { kind: 'add' };
    if (path === 'edit') return { kind: 'edit', id: child!.snapshot.paramMap.get('id') ?? '' };
    return undefined;
  });
  const detailOpen = computed(() => !!selection());

  return {
    selection,
    detailOpen,
    selectedId: computed(() => {
      const s = selection();
      return s?.kind === 'edit' ? s.id : null;
    }),
    isSplit,
    showBack: computed(() => !isSplit() && detailOpen()),
  };
}
