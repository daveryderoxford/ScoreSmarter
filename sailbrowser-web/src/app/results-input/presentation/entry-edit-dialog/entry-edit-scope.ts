import { ChangeDetectionStrategy, Component, computed, input, OnInit, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import type { SeriesEntryMatchingStrategy } from 'app/entry/model/entry-grouping';
import { Race } from 'app/race-calender';
import { ResolvedRaceCompetitor } from 'app/results-input/model/resolved-race-competitor';
import { SeriesEntry } from 'app/results-input/model/series-entry';
import { Handicap } from 'app/scoring/model/handicap';
import { RaceTitlePipe } from 'app/shared/pipes/race-title-pipe';
import { SubmitButton } from 'app/shared/components/submit-button';
import { EntryEditCommand, EntryEditScope } from '../../services/race-competitor-edit.service';
import { IdentityChange } from '../../services/series-entry-identity';

const MAX_LISTED_RACES = 6;

/**
 * Second step of Edit entry, shown when an identity change would affect other races.
 * A class change defaults to this race; a helm or sail-number change has no default.
 */
@Component({
  selector: 'app-entry-edit-scope',
  imports: [MatButtonModule, MatCheckboxModule, MatRadioModule, RaceTitlePipe, SubmitButton],
  templateUrl: './entry-edit-scope.html',
  styleUrls: ['../_competitor-edit-form.scss', './entry-edit-scope.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryEditScopeStep implements OnInit {
  readonly competitor = input.required<ResolvedRaceCompetitor>();
  readonly command = input.required<EntryEditCommand>();
  readonly change = input.required<Exclude<IdentityChange, 'none'>>();
  readonly otherRaces = input.required<Race[]>();
  readonly strategy = input.required<SeriesEntryMatchingStrategy>();
  readonly handicapPreview = input<Handicap[]>([]);
  /** An entry that already has the new identity; the edit joins it rather than creating one. */
  readonly existingEntry = input<SeriesEntry | undefined>();
  readonly busy = input(false);

  readonly confirmed = output<EntryEditScope>();
  readonly back = output<void>();

  protected readonly scope = signal<EntryEditScope | null>(null);
  protected readonly allRacesConfirmed = signal(false);

  protected readonly oldHelm = computed(() => this.competitor().helm);
  protected readonly newHelm = computed(() => this.command().helm.trim());
  protected readonly oldClass = computed(() => this.competitor().boatClass);
  protected readonly newClass = computed(() => this.command().boatClass.trim());
  protected readonly otherCount = computed(() => this.otherRaces().length);
  protected readonly listedRaces = computed(() => this.otherRaces().slice(0, MAX_LISTED_RACES));
  protected readonly unlistedCount = computed(() => Math.max(0, this.otherCount() - MAX_LISTED_RACES));

  protected readonly handicapText = computed(() =>
    this.handicapPreview().map(h => `${h.scheme} ${h.value}`).join(', '),
  );

  protected readonly raceOnlyEffect = computed(() =>
    raceOnlyEffect(this.strategy(), this.change(), this.oldHelm(), this.newHelm()),
  );

  protected readonly canSave = computed(() => {
    const scope = this.scope();
    if (!scope) return false;
    return !(this.change() === 'class' && scope === 'series' && !this.allRacesConfirmed());
  });

  ngOnInit(): void {
    if (this.change() === 'class') this.scope.set('race');
  }

  protected racesWord(count: number): string {
    return count === 1 ? 'race' : 'races';
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const scope = this.scope();
    if (scope && this.canSave()) this.confirmed.emit(scope);
  }
}

/** How a this-race-only change affects series scoring under the series' grouping. */
function raceOnlyEffect(
  strategy: SeriesEntryMatchingStrategy,
  change: Exclude<IdentityChange, 'none'>,
  oldHelm: string,
  newHelm: string,
): string {
  switch (strategy) {
    case 'helm':
      return change === 'helm'
        ? `Results are grouped by helm, so this race counts towards ${newHelm}'s series score, not ${oldHelm}'s.`
        : `Results are grouped by helm, so this race still counts towards ${oldHelm}'s series score.`;
    case 'classSailNumber':
      return change === 'helm'
        ? `Results are grouped by boat, so this race still counts towards this boat's series score.`
        : `Results are grouped by boat, so this race counts towards a different boat's series score.`;
    case 'classSailNumberHelm':
    case 'regatta':
      return `Each class, sail number and helm is scored separately in this series, so this race counts towards a separate series score.`;
  }
}
