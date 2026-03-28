import {
  CdkDragDrop,
  CdkDropList,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
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
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { Race } from 'app/race-calender';
import { isFinishedComp } from 'app/scoring/model/result-code-scoring';
import { normaliseString } from 'app/shared/utils/string-utils';
import { firstValueFrom, map, startWith } from 'rxjs';
import { RaceCompetitor } from '../../model/race-competitor';
import {
  computeManualPositionsForOrderEntry,
  ManualResultsService,
  OrderEntryRowState,
} from '../../services/manual-results.service';
import { sortEntries } from '../../services/race-competitor-store';
import { ManualResultCodeDialog } from '../manual-result-code-dialog';

@Component({
  selector: 'app-manual-order-entry',
  imports: [
    DragDropModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatMenuModule,
    ReactiveFormsModule,
  ],
  templateUrl: './manual-order-entry.html',
  styleUrl: './manual-order-entry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualOrderEntry implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly manualResults = inject(ManualResultsService);
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly dialog = inject(MatDialog);

  race = input.required<Race>();
  competitors = input.required<RaceCompetitor[]>();

  readonly isMobile = toSignal(
    this.breakpoint.observe('(max-width: 1023px)').pipe(map(r => r.matches)),
    { initialValue: false }
  );

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('entrySearch');
  private readonly remainingListRef = viewChild<CdkDropList<string[]>>('remainingList');

  readonly searchControl = this.fb.nonNullable.control('');
  readonly searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(startWith(this.searchControl.value)),
    { initialValue: '' }
  );

  /** Pre-add defaults for competitors still in the left list (not yet in processed queue). */
  readonly pendingDefaults = signal<Map<string, OrderEntryRowState>>(new Map());

  readonly processedIds = signal<string[]>([]);
  readonly remainingIds = signal<string[]>([]);
  readonly rowState = signal<Map<string, OrderEntryRowState>>(new Map());
  readonly selectedMatchId = signal<string | undefined>(undefined);

  readonly pendingPersist = signal(false);

  private lastInitRaceId = '';

  readonly compById = computed(() => {
    const m = new Map<string, RaceCompetitor>();
    for (const c of this.competitors()) {
      m.set(c.id, c);
    }
    return m;
  });

  /** Keyword match for dimming / selection (full list remains in remainingIds for CDK) */
  matchesSearch(id: string): boolean {
    const term = normaliseString(this.searchTerm());
    if (!term) return true;
    const c = this.compById().get(id);
    if (!c) return false;
    const hay = normaliseString(`${c.sailNumber} ${c.helm} ${c.boatClass}`);
    return hay.includes(term);
  }

  readonly filteredRemaining = computed(() => {
    const term = normaliseString(this.searchTerm());
    const ids = this.remainingIds();
    const byId = this.compById();
    const list = term
      ? ids.filter(id => {
          const c = byId.get(id);
          if (!c) return false;
          const hay = normaliseString(`${c.sailNumber} ${c.helm} ${c.boatClass}`);
          return hay.includes(term);
        })
      : [...ids];
    return list.sort((a, b) => sortEntries(byId.get(a)!, byId.get(b)!));
  });

  /** Unique sail number among remaining (Enter commits even if keyword also matches others) */
  readonly exactSailMatchId = computed(() => {
    const raw = this.searchTerm().trim();
    if (!raw || !/^\d+$/.test(raw)) {
      return undefined;
    }
    const n = Number(raw);
    const matches = this.remainingIds().filter(id => this.compById().get(id)?.sailNumber === n);
    return matches.length === 1 ? matches[0] : undefined;
  });

  readonly canCommitEnter = computed(() => {
    const exact = this.exactSailMatchId();
    if (exact) return true;
    const sel = this.selectedMatchId();
    if (sel && this.remainingIds().includes(sel)) return true;
    const f = this.filteredRemaining();
    // One row in the current list (no search, or search narrowed to one): Enter adds it.
    if (f.length === 1) return true;
    return false;
  });

  readonly previewCompetitor = computed(() => {
    const exact = this.exactSailMatchId();
    if (exact) return this.compById().get(exact);
    const sel = this.selectedMatchId();
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

  readonly remainingCount = computed(() => this.remainingIds().length);
  readonly totalCount = computed(() => this.competitors().length);

  /** Effective manual position per row (ties share the same number). */
  readonly manualPositions = computed(() =>
    computeManualPositionsForOrderEntry(this.processedIds(), this.rowState())
  );

  constructor() {
    effect(() => {
      const r = this.race();
      const comps = this.competitors();
      if (!r?.id) return;
      if (r.id !== this.lastInitRaceId) {
        this.lastInitRaceId = r.id;
        untracked(() => this.initFromCompetitors(comps));
      }
    });

    /** No single target: drop row selection so preview / Enter don't follow stale picks. */
    effect(() => {
      const term = normaliseString(this.searchTerm());
      const f = this.filteredRemaining();
      const sel = this.selectedMatchId();
      untracked(() => {
        if (term && f.length > 1) {
          this.selectedMatchId.set(undefined);
        } else if (term && sel !== undefined && !f.includes(sel)) {
          this.selectedMatchId.set(undefined);
        }
      });
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.focusSearch(), 0);
  }

  focusSearch(): void {
    this.searchInput()?.nativeElement?.focus();
  }

  private initFromCompetitors(comps: RaceCompetitor[]): void {
    const sorted = [...comps].sort(sortEntries);

    const withPos = comps
      .filter(c => c.manualPosition != null && c.manualPosition !== undefined)
      .sort((a, b) => (a.manualPosition ?? 0) - (b.manualPosition ?? 0));
    const withPosIds = new Set(withPos.map(c => c.id));

    const processedNoPos = sorted.filter(
      c => !withPosIds.has(c.id) && c.resultCode !== 'NOT FINISHED'
    );

    const processed = [...withPos.map(c => c.id), ...processedNoPos.map(c => c.id)];
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

    this.processedIds.set(processed);
    this.remainingIds.set(remaining);
    this.rowState.set(state);
    this.pendingDefaults.set(new Map());
    this.selectedMatchId.set(undefined);
    this.searchControl.setValue('');
    setTimeout(() => this.focusSearch(), 0);
  }

  selectMatch(id: string): void {
    if (this.searchTerm().trim() && !this.matchesSearch(id)) {
      return;
    }
    this.searchControl.setValue('');
    this.selectedMatchId.set(id);
  }

  async commitFromEntry(): Promise<void> {
    const exact = this.exactSailMatchId();
    if (exact) {
      await this.addToProcessed(exact);
      return;
    }
    const sel = this.selectedMatchId();
    if (sel && this.remainingIds().includes(sel)) {
      await this.addToProcessed(sel);
      return;
    }
    const f = this.filteredRemaining();
    if (f.length === 1) {
      await this.addToProcessed(f[0]);
    }
  }

  private async addToProcessed(competitorId: string): Promise<void> {
    const rem = this.remainingIds().filter(id => id !== competitorId);
    const proc = [...this.processedIds(), competitorId];
    const state = new Map(this.rowState());
    const pending = new Map(this.pendingDefaults());
    const preset = pending.get(competitorId);
    const base: OrderEntryRowState = preset ?? {
      resultCode: 'OK',
      manualFinishTime: null,
      rankOverride: null,
    };
    pending.delete(competitorId);
    this.pendingDefaults.set(pending);

    const nextRankOverride = isFinishedComp(base.resultCode) ? base.rankOverride ?? null : null;
    state.set(competitorId, {
      resultCode: base.resultCode,
      manualFinishTime: this.race().type === 'Level Rating' ? base.manualFinishTime ?? null : null,
      rankOverride: nextRankOverride,
    });
    this.remainingIds.set(rem);
    this.processedIds.set(proc);
    this.rowState.set(state);
    this.selectedMatchId.set(undefined);
    this.searchControl.setValue('');
    await this.persist();
    this.focusSearch();
  }

  async setRemainingResultCode(id: string): Promise<void> {
    if (!this.remainingIds().includes(id)) return;
    const pending = this.pendingDefaults().get(id);
    const dialogRef = this.dialog.open(ManualResultCodeDialog, {
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
    const proc = this.processedIds().filter(id => id !== competitorId);
    const rem = [...this.remainingIds(), competitorId].sort((a, b) =>
      sortEntries(this.compById().get(a)!, this.compById().get(b)!)
    );
    const state = new Map(this.rowState());
    state.delete(competitorId);
    this.processedIds.set(proc);
    this.remainingIds.set(rem);
    this.rowState.set(state);
    await this.persist();
    this.focusSearch();
  }

  async setRowResultCode(id: string): Promise<void> {
    const row = this.rowState().get(id);
    if (!row) return;

    const dialogRef = this.dialog.open(ManualResultCodeDialog, {
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

    const state = new Map(this.rowState());
    state.set(id, next);
    this.rowState.set(state);

    await this.persist();
  }

  canTieWithAbove(id: string): boolean {
    const proc = this.processedIds();
    const idx = proc.indexOf(id);
    if (idx <= 0) return false;
    const aboveId = proc[idx - 1];
    const row = this.rowState().get(id);
    const aboveRow = this.rowState().get(aboveId);
    if (!row || !aboveRow) return false;
    return isFinishedComp(row.resultCode) && isFinishedComp(aboveRow.resultCode);
  }

  /**
   * True when this row is in a tie with any finished boat further up the list (same effective rank).
   * Uses an upward scan so clearing a middle boat of a multi-way tie still leaves "Clear tie" on the rest.
   */
  canClearTie(id: string): boolean {
    const proc = this.processedIds();
    const idx = proc.indexOf(id);
    if (idx <= 0) return false;
    const row = this.rowState().get(id);
    if (!row || !isFinishedComp(row.resultCode)) return false;
    const positions = computeManualPositionsForOrderEntry(proc, this.rowState());
    const p = positions.get(id);
    if (typeof p !== 'number') return false;
    for (let j = idx - 1; j >= 0; j--) {
      const upId = proc[j];
      const upRow = this.rowState().get(upId);
      if (!upRow || !isFinishedComp(upRow.resultCode)) continue;
      const pu = positions.get(upId);
      if (typeof pu === 'number' && pu === p) return true;
    }
    return false;
  }

  async tieWithAbove(id: string): Promise<void> {
    const proc = this.processedIds();
    const idx = proc.indexOf(id);
    if (idx <= 0) return;
    const aboveId = proc[idx - 1];
    const row = this.rowState().get(id);
    const aboveRow = this.rowState().get(aboveId);
    if (!row || !aboveRow) return;
    if (!isFinishedComp(row.resultCode) || !isFinishedComp(aboveRow.resultCode)) return;

    const positions = computeManualPositionsForOrderEntry(proc, this.rowState());
    const aboveRank = positions.get(aboveId);
    if (typeof aboveRank !== 'number') return;

    const state = new Map(this.rowState());
    state.set(id, { ...row, rankOverride: aboveRank });
    this.rowState.set(state);
    await this.persist();
  }

  async clearTie(id: string): Promise<void> {
    if (!this.canClearTie(id)) return;
    const row = this.rowState().get(id);
    if (!row) return;
    const state = new Map(this.rowState());
    state.set(id, { ...row, rankOverride: null });
    this.rowState.set(state);
    await this.persist();
  }

  drop(event: CdkDragDrop<string[]>): void {
    const rem = [...this.remainingIds()];
    const proc = [...this.processedIds()];
    const remainingList = this.remainingListRef();
    const prev = event.previousContainer;
    const cont = event.container;

    if (prev === cont) {
      if (remainingList && prev === remainingList) {
        moveItemInArray(rem, event.previousIndex, event.currentIndex);
      } else {
        moveItemInArray(proc, event.previousIndex, event.currentIndex);
      }
    } else if (remainingList && prev === remainingList) {
      transferArrayItem(rem, proc, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(proc, rem, event.previousIndex, event.currentIndex);
    }

    this.remainingIds.set(rem);
    this.processedIds.set(proc);
    this.syncRowStateAfterLists(rem, proc);
    void this.persist();
    this.focusSearch();
  }

  private syncRowStateAfterLists(rem: string[], proc: string[]): void {
    const state = new Map(this.rowState());
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
    this.rowState.set(state);
    this.pendingDefaults.set(pending);
  }

  async undoLast(): Promise<void> {
    const proc = this.processedIds();
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
      this.searchControl.setValue('');
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
        processedIds: this.processedIds(),
        rowState: this.rowState(),
      });
    } finally {
      this.pendingPersist.set(false);
    }
  }

  trackById = (_: number, id: string) => id;

  rowFor(id: string): OrderEntryRowState | undefined {
    return this.rowState().get(id);
  }

  /** Shown in the finish-order column; reflects ties, not list index. */
  queueRankLabel(id: string): string {
    const p = this.manualPositions().get(id);
    if (p === undefined) return '—';
    return `${p}.`;
  }
}
