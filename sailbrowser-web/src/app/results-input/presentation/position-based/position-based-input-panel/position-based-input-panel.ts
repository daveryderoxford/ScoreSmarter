import { CdkDragDrop, CdkDropList, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { Race } from 'app/race-calender';
import { isFinishedComp } from 'app/scoring/model/result-code-scoring';
import { normaliseString } from 'app/shared/utils/string-utils';
import { firstValueFrom, map } from 'rxjs';
import {
  buildTieGroupsFromPlaced,
  clearTieRankOverrideChain,
  enforceProcessedSegmentOrder,
  flattenTieGroups,
  ManualResultsService,
  mergePlacedAndNonPlacedSegments,
  normalizeRowStateFromOrderedTieGroups,
  OrderEntryRowState,
  segmentProcessedPlacedAndNonPlaced,
  TieGroupRow,
} from '../../../services/manual-results.service';
import { ResultCodeDialog } from '../result-code-dialog';
import { ResolvedRaceCompetitor, sortResolvedCompetitors } from 'app/results-input';
import { EditRaceCompetitorDialog } from '../../edit-race-competitor-dialog/edit-race-competitor-dialog';
import { RaceCompetitorEditService } from '../../../services/race-competitor-edit.service';

/** Placing / penalty queue derived from `RaceCompetitor[]`; overwritten when race or row-id set changes. */
interface OrderQueueModel {
  processedIds: string[];
  remainingIds: string[];
  rowState: Map<string, OrderEntryRowState>;
}

function emptyOrderQueue(): OrderQueueModel {
  return { processedIds: [], remainingIds: [], rowState: new Map() };
}

function buildOrderQueueFromCompetitors(comps: ResolvedRaceCompetitor[]): OrderQueueModel {
  const sorted = [...comps].sort(sortResolvedCompetitors);

  const withPos = comps
    .filter(c => c.manualPosition != null && c.manualPosition !== undefined)
    .sort((a, b) => (a.manualPosition ?? 0) - (b.manualPosition ?? 0));
  const withPosIds = new Set(withPos.map(c => c.id));

  const processedNoPos = sorted.filter(
    c => !withPosIds.has(c.id) && c.resultCode !== 'NOT FINISHED',
  );

  let processed = [...withPos.map(c => c.id), ...processedNoPos.map(c => c.id)];
  const processedSet = new Set(processed);
  const remaining = sorted.filter(c => !processedSet.has(c.id)).map(c => c.id);

  const state = new Map<string, OrderEntryRowState>();
  for (const id of processed) {
    const c = comps.find(x => x.id === id)!;
    state.set(id, {
      resultCode: c.resultCode,
      manualFinishTime: c.manualFinishTime ?? null,
      rankOverride:
        isFinishedComp(c.resultCode) && c.manualPosition != null ? c.manualPosition : null,
    });
  }

  processed = enforceProcessedSegmentOrder(processed, state);
  const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(processed, state);
  const groups = buildTieGroupsFromPlaced(placed, state);
  const stateNorm = normalizeRowStateFromOrderedTieGroups(groups, state);

  return {
    processedIds: mergePlacedAndNonPlacedSegments(placed, nonPlaced),
    remainingIds: remaining,
    rowState: stateNorm,
  };
}

type OrderEntryInput = { key: string; raceId: string; comps: ResolvedRaceCompetitor[] };

@Component({
  selector: 'app-position-based-input-panel',
  imports: [
    DragDropModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatMenuModule,
    FormsModule,
  ],
  templateUrl: './position-based-input-panel.html',
  styleUrl: './position-based-input-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PositionBasedInputPanel implements AfterViewInit {
  private readonly manualResults = inject(ManualResultsService);
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly dialog = inject(MatDialog);
  private readonly competitorEdit = inject(RaceCompetitorEditService);

  race = input.required<Race>();
  competitors = input.required<ResolvedRaceCompetitor[]>();
  readonly addEntryRequested = output<void>();

  readonly isMobile = toSignal(
    this.breakpoint.observe('(max-width: 1023px)').pipe(map(r => r.matches)),
    { initialValue: false }
  );

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('entrySearch');

  /**
   * Stable key: new value only when the race changes or the set of competitor row ids changes.
   * Drag/drop edits do not change the key, so `orderQueue` stays writable until the next server snapshot.
   */
  private readonly orderEntryInput = computed<OrderEntryInput>(
    () => {
      const r = this.race();
      const comps = this.competitors();
      const raceId = r?.id ?? '';
      const key = raceId
        ? `${raceId}\u0001${[...comps].map(c => c.id).sort().join('\u0001')}`
        : '';
      return { key, raceId, comps };
    },
    { equal: (a, b) => a.key === b.key },
  );

  /**
   * Linked to `orderEntryInput`: recomputes from `competitors()` when the key changes (including
   * `[]` → first rows). User actions call `orderQueue.update` until the next key change.
   */
  readonly orderQueue = linkedSignal<OrderEntryInput, OrderQueueModel>({
    source: () => this.orderEntryInput(),
    computation: (input): OrderQueueModel => {
      if (!input.raceId) {
        return emptyOrderQueue();
      }
      return buildOrderQueueFromCompetitors(input.comps);
    },
  });

  /**
   * Search text, cleared whenever `orderEntryInput().key` changes (same as queue reset).
   * Writable between key changes for typing.
   */
  readonly searchText = linkedSignal<string, string>({
    source: () => this.orderEntryInput().key,
    computation: () => '',
  });

  /** Pre-add defaults for competitors still in the left list (not yet in processed queue). */
  readonly pendingDefaults = linkedSignal<string, Map<string, OrderEntryRowState>>({
    source: () => this.orderEntryInput().key,
    computation: () => new Map(),
  });

  /** Row the user last clicked in the remaining list; reset when the entry key changes. */
  readonly selectedMatchId = linkedSignal<string, string | undefined>({
    source: () => this.orderEntryInput().key,
    computation: () => undefined,
  });

  readonly pendingPersist = signal(false);

  readonly compById = computed(() => {
    const m = new Map<string, ResolvedRaceCompetitor>();
    for (const c of this.competitors()) {
      m.set(c.id, c);
    }
    return m;
  });

  /** Tie groups for placings (drag one card per group). */
  readonly placingTieGroups = computed(() => {
    const q = this.orderQueue();
    const { placed } = segmentProcessedPlacedAndNonPlaced(q.processedIds, q.rowState);
    return buildTieGroupsFromPlaced(placed, q.rowState);
  });

  /** First competitor id per tie group — CDK list data keys. */
  readonly placingGroupDropKeys = computed(() => this.placingTieGroups().map(g => g.ids[0]));

  readonly nonPlacedSegmentIds = computed(() => {
    const q = this.orderQueue();
    const { nonPlaced } = segmentProcessedPlacedAndNonPlaced(q.processedIds, q.rowState);
    return nonPlaced;
  });

  /** Keyword match for dimming / selection (full list remains in remainingIds for CDK) */
  matchesSearch(id: string): boolean {
    const term = normaliseString(this.searchText());
    if (!term) return true;
    const c = this.compById().get(id);
    if (!c) return false;
    const hay = normaliseString(`${c.sailNumber} ${c.helm} ${c.boatClass}`);
    return hay.includes(term);
  }

  readonly filteredRemaining = computed(() => {
    const term = normaliseString(this.searchText());
    const ids = this.orderQueue().remainingIds;
    const byId = this.compById();
    const list = term
      ? ids.filter(id => {
          const c = byId.get(id);
          if (!c) return false;
          const hay = normaliseString(`${c.sailNumber} ${c.helm} ${c.boatClass}`);
          return hay.includes(term);
        })
      : [...ids];
    return list.sort((a, b) => sortResolvedCompetitors(byId.get(a)!, byId.get(b)!));
  });

  /**
   * Click selection is only meaningful when it matches the current filter (same rules as the old
   * “clear selection” effect, but derived).
   */
  readonly effectiveSelectedMatchId = computed(() => {
    const sel = this.selectedMatchId();
    const term = normaliseString(this.searchText());
    const f = this.filteredRemaining();
    if (term && f.length > 1) {
      return undefined;
    }
    if (sel !== undefined && term && !f.includes(sel)) {
      return undefined;
    }
    return sel;
  });

  /** Unique sail number among remaining (Enter commits even if keyword also matches others) */
  readonly exactSailMatchId = computed(() => {
    const raw = this.searchText().trim();
    if (!raw || !/^\d+$/.test(raw)) {
      return undefined;
    }
    const n = Number(raw);
    const matches = this.orderQueue().remainingIds.filter(id => this.compById().get(id)?.sailNumber === n);
    return matches.length === 1 ? matches[0] : undefined;
  });

  readonly canCommitEnter = computed(() => {
    const exact = this.exactSailMatchId();
    if (exact) return true;
    const sel = this.selectedMatchId();
    if (sel && this.orderQueue().remainingIds.includes(sel)) return true;
    const f = this.filteredRemaining();
    if (f.length === 1) return true;
    return false;
  });

  readonly previewCompetitor = computed(() => {
    const exact = this.exactSailMatchId();
    if (exact) return this.compById().get(exact);
    const sel = this.effectiveSelectedMatchId();
    if (sel) return this.compById().get(sel);
    const f = this.filteredRemaining();
    if (f.length === 1) return this.compById().get(f[0]);
    return undefined;
  });

  readonly previewPending = computed(() => {
    const m = this.previewCompetitor();
    if (!m) return undefined;
    return this.pendingDefaults().get(m.id);
  });

  readonly remainingCount = computed(() => this.orderQueue().remainingIds.length);
  readonly totalCount = computed(() => this.competitors().length);

  constructor() {
    // DOM focus cannot be expressed as a computed; keep this narrow side effect.
    effect(() => {
      this.orderEntryInput().key;
      untracked(() => queueMicrotask(() => this.focusSearch()));
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.focusSearch(), 0);
  }

  focusSearch(): void {
    this.searchInput()?.nativeElement?.focus();
  }

  requestAddEntry(): void {
    this.addEntryRequested.emit();
  }

  private zoneFromContainer(container: CdkDropList<string[]>): string {
    return (container.element.nativeElement as HTMLElement).dataset['zone'] ?? '';
  }

  selectMatch(id: string): void {
    if (this.searchText().trim() && !this.matchesSearch(id)) {
      return;
    }
    this.searchText.set('');
    this.selectedMatchId.set(id);
  }

  async commitFromEntry(): Promise<void> {
    const exact = this.exactSailMatchId();
    if (exact) {
      await this.addToProcessed(exact);
      return;
    }
    const sel = this.selectedMatchId();
    if (sel && this.orderQueue().remainingIds.includes(sel)) {
      await this.addToProcessed(sel);
      return;
    }
    const f = this.filteredRemaining();
    if (f.length === 1) {
      await this.addToProcessed(f[0]);
    }
  }

  private async addToProcessed(competitorId: string): Promise<void> {
    const rem = this.orderQueue().remainingIds.filter(id => id !== competitorId);
    const pending = new Map(this.pendingDefaults());
    const preset = pending.get(competitorId);
    const base: OrderEntryRowState = preset ?? {
      resultCode: 'OK',
      manualFinishTime: null,
      rankOverride: null,
    };
    pending.delete(competitorId);
    this.pendingDefaults.set(pending);

    let state = new Map(this.orderQueue().rowState);
    const nextRankOverride = isFinishedComp(base.resultCode) ? base.rankOverride ?? null : null;
    state.set(competitorId, {
      resultCode: base.resultCode,
      manualFinishTime: this.race().type === 'Level Rating' ? base.manualFinishTime ?? null : null,
      rankOverride: nextRankOverride,
    });

    const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(this.orderQueue().processedIds, state);
    if (isFinishedComp(base.resultCode)) {
      placed.push(competitorId);
    } else {
      nonPlaced.push(competitorId);
    }
    let proc = mergePlacedAndNonPlacedSegments(placed, nonPlaced);
    proc = enforceProcessedSegmentOrder(proc, state);
    const seg = segmentProcessedPlacedAndNonPlaced(proc, state);
    const groups = buildTieGroupsFromPlaced(seg.placed, state);
    state = normalizeRowStateFromOrderedTieGroups(groups, state);

    this.orderQueue.update(q => ({
      ...q,
      remainingIds: rem,
      processedIds: proc,
      rowState: state,
    }));
    this.selectedMatchId.set(undefined);
    this.searchText.set('');
    await this.persist();
    this.focusSearch();
  }

  async setRemainingResultCode(id: string): Promise<void> {
    if (!this.orderQueue().remainingIds.includes(id)) return;
    const pending = this.pendingDefaults().get(id);
    const dialogRef = this.dialog.open(ResultCodeDialog, {
      data: {
        race: this.race(),
        initialResultCode: pending?.resultCode ?? 'OK',
        initialFinishTime: pending?.manualFinishTime ?? null,
      },
      width: '420px',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    const next = new Map(this.pendingDefaults());
    next.set(id, {
      resultCode: result.resultCode,
      manualFinishTime: this.race().type === 'Level Rating' ? result.finishTime : null,
      rankOverride: null,
    });
    this.pendingDefaults.set(next);
    await this.addToProcessed(id);
  }

  async removeFromQueue(competitorId: string): Promise<void> {
    const proc = this.orderQueue().processedIds.filter(id => id !== competitorId);
    const rem = [...this.orderQueue().remainingIds, competitorId].sort((a, b) =>
      sortResolvedCompetitors(this.compById().get(a)!, this.compById().get(b)!)
    );
    const state = new Map(this.orderQueue().rowState);
    state.delete(competitorId);
    this.orderQueue.update(q => ({
      ...q,
      processedIds: proc,
      remainingIds: rem,
      rowState: state,
    }));
    await this.persist();
    this.focusSearch();
  }

  async setRowResultCode(id: string): Promise<void> {
    const row = this.orderQueue().rowState.get(id);
    if (!row) return;

    const dialogRef = this.dialog.open(ResultCodeDialog, {
      data: {
        race: this.race(),
        initialResultCode: row.resultCode,
        initialFinishTime: row.manualFinishTime ?? null,
      },
      width: '420px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());

    if (!result) return;

    const next: OrderEntryRowState = {
      ...row,
      resultCode: result.resultCode,
      manualFinishTime: this.race().type === 'Level Rating' ? result.finishTime : null,
      rankOverride: isFinishedComp(result.resultCode) ? row.rankOverride ?? null : null,
    };

    let state = new Map(this.orderQueue().rowState);
    state.set(id, next);
    let proc = enforceProcessedSegmentOrder(this.orderQueue().processedIds, state);
    const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(proc, state);
    const groups = buildTieGroupsFromPlaced(placed, state);
    state = normalizeRowStateFromOrderedTieGroups(groups, state);
    proc = mergePlacedAndNonPlacedSegments(placed, nonPlaced);

    this.orderQueue.update(q => ({ ...q, processedIds: proc, rowState: state }));

    await this.persist();
  }

  canTieWithAbove(id: string): boolean {
    const row = this.orderQueue().rowState.get(id);
    if (!row || !isFinishedComp(row.resultCode)) return false;
    const { placed } = segmentProcessedPlacedAndNonPlaced(this.orderQueue().processedIds, this.orderQueue().rowState);
    const groups = buildTieGroupsFromPlaced(placed, this.orderQueue().rowState);
    const gi = groups.findIndex(g => g.ids.includes(id));
    return gi > 0;
  }

  canClearTie(id: string): boolean {
    const row = this.orderQueue().rowState.get(id);
    if (!row || !isFinishedComp(row.resultCode)) return false;
    const { placed } = segmentProcessedPlacedAndNonPlaced(this.orderQueue().processedIds, this.orderQueue().rowState);
    const groups = buildTieGroupsFromPlaced(placed, this.orderQueue().rowState);
    const g = groups.find(gr => gr.ids.includes(id));
    return g != null && g.ids.length > 1;
  }

  async tieWithAbove(id: string): Promise<void> {
    if (!this.canTieWithAbove(id)) return;
    const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(this.orderQueue().processedIds, this.orderQueue().rowState);
    let groups = buildTieGroupsFromPlaced(placed, this.orderQueue().rowState);
    const gi = groups.findIndex(g => g.ids.includes(id));
    if (gi <= 0) return;

    const merged: TieGroupRow = {
      rank: 0,
      ids: [...groups[gi - 1].ids, ...groups[gi].ids],
    };
    groups = [...groups.slice(0, gi - 1), merged, ...groups.slice(gi + 1)];
    const newPlaced = flattenTieGroups(groups);
    let state = new Map(this.orderQueue().rowState);
    state = normalizeRowStateFromOrderedTieGroups(groups, state);
    this.orderQueue.update(q => ({
      ...q,
      processedIds: mergePlacedAndNonPlacedSegments(newPlaced, nonPlaced),
      rowState: state,
    }));
    await this.persist();
  }

  async clearTie(id: string): Promise<void> {
    if (!this.canClearTie(id)) return;
    const processed = [...this.orderQueue().processedIds];
    let state = new Map(this.orderQueue().rowState);
    state = clearTieRankOverrideChain(processed, id, state);
    const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(processed, state);
    const groups = buildTieGroupsFromPlaced(placed, state);
    state = normalizeRowStateFromOrderedTieGroups(groups, state);
    this.orderQueue.update(q => ({
      ...q,
      processedIds: mergePlacedAndNonPlacedSegments(placed, nonPlaced),
      rowState: state,
    }));
    await this.persist();
  }

  drop(event: CdkDragDrop<string[]>): void {
    const prevZone = this.zoneFromContainer(event.previousContainer);
    const zone = this.zoneFromContainer(event.container);
    const rem = [...this.orderQueue().remainingIds];
    let proc = [...this.orderQueue().processedIds];
    let state = new Map(this.orderQueue().rowState);
    const pending = new Map(this.pendingDefaults());

    if (prevZone === zone) {
      if (zone === 'remaining') {
        moveItemInArray(rem, event.previousIndex, event.currentIndex);
      } else if (zone === 'placing') {
        const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(proc, state);
        let groups = buildTieGroupsFromPlaced(placed, state);
        moveItemInArray(groups, event.previousIndex, event.currentIndex);
        const newPlaced = flattenTieGroups(groups);
        state = normalizeRowStateFromOrderedTieGroups(groups, state);
        proc = mergePlacedAndNonPlacedSegments(newPlaced, nonPlaced);
      } else if (zone === 'non-placed') {
        const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(proc, state);
        const np = [...nonPlaced];
        moveItemInArray(np, event.previousIndex, event.currentIndex);
        proc = mergePlacedAndNonPlacedSegments(placed, np);
      }
    } else if (prevZone === 'remaining' && (zone === 'placing' || zone === 'non-placed')) {
      const id = rem[event.previousIndex];
      rem.splice(event.previousIndex, 1);
      const preset = pending.get(id);
      const base: OrderEntryRowState = preset ?? {
        resultCode: 'OK',
        manualFinishTime: null,
        rankOverride: null,
      };
      pending.delete(id);
      state.set(id, {
        resultCode: base.resultCode,
        manualFinishTime: this.race().type === 'Level Rating' ? base.manualFinishTime ?? null : null,
        rankOverride: isFinishedComp(base.resultCode) ? base.rankOverride ?? null : null,
      });

      if (zone === 'placing') {
        const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(proc, state);
        let groups = buildTieGroupsFromPlaced(placed, state);
        const newGroup: TieGroupRow = { rank: 0, ids: [id] };
        groups.splice(event.currentIndex, 0, newGroup);
        const newPlaced = flattenTieGroups(groups);
        state = normalizeRowStateFromOrderedTieGroups(groups, state);
        proc = mergePlacedAndNonPlacedSegments(newPlaced, nonPlaced);
      } else {
        const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(proc, state);
        const np = [...nonPlaced];
        np.splice(event.currentIndex, 0, id);
        proc = mergePlacedAndNonPlacedSegments(placed, np);
      }
    } else if (zone === 'remaining') {
      if (prevZone === 'placing') {
        const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(proc, state);
        let groups = buildTieGroupsFromPlaced(placed, state);
        const group = groups[event.previousIndex];
        groups.splice(event.previousIndex, 1);
        for (const gid of group.ids) {
          state.delete(gid);
        }
        rem.push(...group.ids);
        rem.sort((a, b) => sortResolvedCompetitors(this.compById().get(a)!, this.compById().get(b)!));
        const newPlaced = flattenTieGroups(groups);
        const g2 = buildTieGroupsFromPlaced(newPlaced, state);
        state = normalizeRowStateFromOrderedTieGroups(g2, state);
        proc = mergePlacedAndNonPlacedSegments(newPlaced, nonPlaced);
      } else if (prevZone === 'non-placed') {
        const { placed, nonPlaced } = segmentProcessedPlacedAndNonPlaced(proc, state);
        const id = nonPlaced[event.previousIndex];
        const np = [...nonPlaced];
        np.splice(event.previousIndex, 1);
        state.delete(id);
        rem.push(id);
        rem.sort((a, b) => sortResolvedCompetitors(this.compById().get(a)!, this.compById().get(b)!));
        proc = mergePlacedAndNonPlacedSegments(placed, np);
      }
    }

    this.orderQueue.update(q => ({
      ...q,
      remainingIds: rem,
      processedIds: proc,
      rowState: state,
    }));
    this.pendingDefaults.set(pending);
    this.syncRowStateAfterLists(rem, proc);
    void this.persist();
    this.focusSearch();
  }

  private syncRowStateAfterLists(rem: string[], proc: string[]): void {
    const state = new Map(this.orderQueue().rowState);
    const pending = new Map(this.pendingDefaults());
    for (const id of proc) {
      if (!state.has(id)) {
        const preset = pending.get(id);
        state.set(
          id,
          preset ?? {
            resultCode: 'OK',
            manualFinishTime: null,
            rankOverride: null,
          }
        );
        if (preset) {
          pending.delete(id);
        }
      }
    }
    for (const id of [...state.keys()]) {
      if (!proc.includes(id)) {
        state.delete(id);
      }
    }
    this.orderQueue.update(q => ({ ...q, rowState: state }));
    this.pendingDefaults.set(pending);
  }

  async undoLast(): Promise<void> {
    const proc = this.orderQueue().processedIds;
    if (proc.length === 0) return;
    const last = proc[proc.length - 1];
    await this.removeFromQueue(last);
  }

  onSearchKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void this.commitFromEntry();
    }
    if (ev.key === 'Escape') {
      this.searchText.set('');
      this.selectedMatchId.set(undefined);
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z') {
      ev.preventDefault();
      void this.undoLast();
    }
  }

  private async persist(): Promise<void> {
    this.pendingPersist.set(true);
    try {
      await this.manualResults.persistOrderEntryState({
        race: this.race(),
        competitors: this.competitors(),
        processedIds: this.orderQueue().processedIds,
        rowState: this.orderQueue().rowState,
      });
    } finally {
      this.pendingPersist.set(false);
    }
  }

  trackById = (_: number, id: string) => id;

  rowFor(id: string): OrderEntryRowState | undefined {
    return this.orderQueue().rowState.get(id);
  }

  async editCompetitor(id: string): Promise<void> {
    const competitor = this.compById().get(id);
    if (!competitor) return;
    const dialogRef = this.dialog.open(EditRaceCompetitorDialog, {
      width: 'min(92vw, 460px)',
      data: { competitor },
    });
    const command = await firstValueFrom(dialogRef.afterClosed());
    if (!command) return;
    await this.competitorEdit.apply(command);
  }

  /** Rank label for a tie group card (1-based position in placings). */
  groupRankLabel(groupIndex: number): string {
    return `${groupIndex + 1}.`;
  }
}
