import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { BoatsStore } from 'app/boats/services/boats.store';
import type { DncCalculation, OODScoring, ScoringDefaults } from 'app/club-tenant/model/club';
import { ClubStore } from 'app/club-tenant/services/club-store';
import { ClubTenant } from 'app/club-tenant/services/club-tenant';
import { generateSecureID } from 'app/shared/firebase/firestore-helper';
import { cloudCallable } from 'app/shared/firebase/cloud-functions';
import { validateDiscardRaceSequence } from 'app/scoring/model/discard-profile';
import { getFleetName } from 'app/club-tenant/model/fleet';
import { ClassCatalogueStore } from 'app/system-data/services/class-catalogue-store';
import { RatingListStore } from 'app/system-data/services/rating-list-store';
import { checkScoring, oodFrom, scoringDefaultsFrom } from '../model/compare-scoring';
import { draftClub, type DraftBoat, type DraftClass, type DraftFleet } from '../model/draft-club';
import { decodeHtml, savedPageAddress, scoringExcerpt, textFromDocument } from '../model/extract-document-text';
import { parseSailwaveHtml } from '../model/parse-sailwave-html';
import { seriesAge, type SailwaveSeries } from '../model/sailwave-series';
import type { SailingInstructionReading } from '../model/si-proposal';

export interface SeriesChoice {
  series: SailwaveSeries;
  included: boolean;
}

export interface EditableScoring {
  shortDiscards: string;
  longDiscards: string;
  shortDnc: DncCalculation;
  longDnc: DncCalculation;
  oodCode: OODScoring['calculationCode'];
  maxDuties: number;
}

const FALLBACK_DNC: DncCalculation = { basis: 'SeriesEntries', offset: 1, excludeNeverRaced: false };
const LINKED_FAILED = 'The series this results page links to could not be fetched. Save each series page and upload those files.';

interface SailwavePage {
  url: string;
  html: string;
}

type FetchSailwaveResponse =
  | { ok: true; pages: SailwavePage[] }
  | { ok: false; detail: string };

@Injectable()
export class OnboardingSession {
  private readonly clubStore = inject(ClubStore);
  private readonly boatsStore = inject(BoatsStore);
  private readonly catalogue = inject(ClassCatalogueStore);
  private readonly ratingLists = inject(RatingListStore);
  private readonly tenant = inject(ClubTenant);

  readonly seriesChoices = signal<SeriesChoice[]>([]);
  readonly reading = signal<SailingInstructionReading | null>(null);
  readonly instructionStatus = signal('');
  readonly applying = signal(false);
  readonly fetching = signal(false);
  readonly message = signal('');
  /** Fetch is the only results method until a fetch fails. */
  readonly resultsEntry = signal<'fetch' | 'manual'>('fetch');
  private readonly triedAddress = signal('');

  readonly selectedSeries = computed(() =>
    this.seriesChoices().filter(choice => choice.included).map(choice => choice.series));

  readonly draft = computed(() => draftClub(
    this.selectedSeries(),
    this.catalogue.classes(),
    this.ratingLists.lists(),
    this.clubStore.club()?.classes ?? [],
    this.clubStore.club()?.fleets ?? [],
    this.boatsStore.boats(),
  ));

  readonly scoringCheck = computed(() => {
    const reading = this.reading();
    if (!reading) return null;
    return checkScoring(reading, this.selectedSeries());
  });

  readonly classes = linkedSignal(() => this.draft().classes);
  readonly fleets = linkedSignal(() => this.draft().fleets);
  readonly boats = linkedSignal(() => this.draft().boats);
  readonly scoring = linkedSignal(() => this.initialScoring());

  showResultsAddress(): void {
    this.resultsEntry.set('fetch');
    this.message.set('');
  }

  async fetchResults(urlText: string): Promise<void> {
    if (this.fetching()) return;
    const url = urlText.trim();
    if (!url.startsWith('https://')) {
      this.message.set('Enter the full https address of the results page.');
      return;
    }
    this.triedAddress.set(url);
    this.fetching.set(true);
    this.message.set('');
    try {
      const data = await this.requestPages({ url });
      if (!data.ok) {
        this.resultsEntry.set('manual');
        this.message.set(data.detail);
        return;
      }
      if (this.addSeriesFromPages(data.pages) === 0) this.resultsEntry.set('manual');
    } catch (error: unknown) {
      if (staysOnForm(error)) {
        this.message.set(readableError(error, 'The results address could not be fetched.'));
        return;
      }
      this.resultsEntry.set('manual');
      this.message.set('');
    } finally {
      this.fetching.set(false);
    }
  }

  /** Saved series pages are read here. A saved results page has no tables, so the series it links to are fetched. */
  async addHtmlFiles(files: FileList | File[]): Promise<void> {
    if (this.fetching()) return;
    const pages = await Promise.all([...files].map(async file => ({
      url: file.name,
      html: decodeHtml(await file.arrayBuffer()),
    })));
    const seriesPages = pages.filter(page => parseSailwaveHtml(page.html, page.url).length > 0);
    const resultsPages = pages.filter(page => !seriesPages.includes(page));
    if (seriesPages.length > 0) this.addSeriesFromPages(seriesPages);
    for (const page of resultsPages) await this.fetchLinkedSeries(page.html);
  }

  async readInstructions(file: File): Promise<void> {
    this.instructionStatus.set('Reading the sailing instructions…');
    this.message.set('');
    try {
      const text = scoringExcerpt(await textFromDocument(file));
      const callable = await cloudCallable<{ clubId: string; text: string }, SailingInstructionReading>(
        'interpretSailingInstructions',
      );
      const response = await callable({ clubId: this.tenant.clubId, text });
      this.reading.set(response.data);
      this.instructionStatus.set('Sailing instructions read. Check the quotes against the results.');
    } catch (error: unknown) {
      this.instructionStatus.set(error instanceof Error ? error.message : 'The sailing instructions could not be read.');
    }
  }

  toggleSeries(index: number, included: boolean): void {
    this.seriesChoices.update(choices => choices.map((choice, item) => item === index ? { ...choice, included } : choice));
  }

  toggleClass(index: number, included: boolean): void {
    this.classes.update(rows => rows.map((row, item) => item === index ? { ...row, included } : row));
  }

  toggleFleet(index: number, included: boolean): void {
    this.fleets.update(rows => rows.map((row, item) => item === index ? { ...row, included } : row));
  }

  toggleBoat(index: number, included: boolean): void {
    this.boats.update(rows => rows.map((row, item) => item === index ? { ...row, included } : row));
  }

  updateScoring(patch: Partial<EditableScoring>): void {
    this.scoring.update(current => ({ ...current, ...patch }));
  }

  updateDnc(which: string, patch: Partial<DncCalculation>): void {
    if (which !== 'short' && which !== 'long') return;
    this.scoring.update(current => {
      const key = which === 'short' ? 'shortDnc' : 'longDnc';
      const next = { ...current[key], ...patch };
      if (next.basis === 'SeriesEntries') next.offset = 1;
      return { ...current, [key]: next };
    });
  }

  async apply(): Promise<boolean> {
    const shortDiscards = parseMilestones(this.scoring().shortDiscards);
    const longDiscards = parseMilestones(this.scoring().longDiscards);
    if (typeof shortDiscards === 'string') {
      this.message.set(shortDiscards);
      return false;
    }
    if (typeof longDiscards === 'string') {
      this.message.set(longDiscards);
      return false;
    }
    this.applying.set(true);
    this.message.set('');
    try {
      for (const row of this.classes()) {
        if (row.included && row.boatClass) await this.clubStore.addClass(row.boatClass);
      }
      for (const row of this.fleets()) {
        if (!row.included || row.fleet.type === 'GeneralHandicap') continue;
        const id = generateSecureID(100, getFleetName(row.fleet));
        await this.clubStore.addFleet({ ...row.fleet, id });
      }
      for (const row of this.boats()) {
        if (!row.included) continue;
        await this.boatsStore.add({
          sailNumber: row.sailNumber,
          boatClass: row.boatClass,
          helm: row.helm,
          crew: row.crew,
          name: row.name,
          isClub: false,
        });
      }
      const scoring = this.scoring();
      await this.clubStore.update({
        shortSeriesDefaults: { discards: shortDiscards, dncCalculation: scoring.shortDnc },
        longSeriesDefaults: { discards: longDiscards, dncCalculation: scoring.longDnc },
        oodScoring: { calculationCode: scoring.oodCode, maxDuties: scoring.maxDuties },
      });
      this.message.set('Club data saved.');
      return true;
    } catch (error: unknown) {
      this.message.set(error instanceof Error ? error.message : 'The club data could not be saved.');
      return false;
    } finally {
      this.applying.set(false);
    }
  }

  private async fetchLinkedSeries(html: string): Promise<void> {
    const url = savedPageAddress(html) ?? this.triedAddress();
    if (!url) {
      this.message.set('That page has no results tables. Upload the saved series pages.');
      return;
    }
    this.fetching.set(true);
    this.message.set('Fetching the series this results page links to…');
    try {
      const data = await this.requestPages({ url, indexHtml: html });
      if (!data.ok) {
        this.message.set(LINKED_FAILED);
        return;
      }
      if (this.addSeriesFromPages(data.pages) === 0) this.message.set(LINKED_FAILED);
    } catch (error: unknown) {
      this.message.set(readableError(error, LINKED_FAILED));
    } finally {
      this.fetching.set(false);
    }
  }

  private async requestPages(request: { url: string; indexHtml?: string }): Promise<FetchSailwaveResponse> {
    const callable = await cloudCallable<{ clubId: string; url: string; indexHtml?: string }, FetchSailwaveResponse>(
      'fetchSailwaveResults',
      { timeout: 120_000 },
    );
    return (await callable({ clubId: this.tenant.clubId, ...request })).data;
  }

  /** Returns how many results tables the pages held, before older series are left out. */
  private addSeriesFromPages(pages: SailwavePage[]): number {
    const found = pages.flatMap(page => parseSailwaveHtml(page.html, page.url));
    if (found.length === 0) {
      this.message.set('No Sailwave results tables were found in those pages.');
      return 0;
    }
    const today = new Date();
    const kept = found.filter(series => seriesAge(series, today) !== 'old');
    this.seriesChoices.update(current => {
      const seen = new Set(current.map(choice => seriesKey(choice.series)));
      const added = kept
        .filter(series => !seen.has(seriesKey(series)))
        .map(series => ({ series, included: seriesAge(series, today) === 'recent' }));
      return [...current, ...added].sort((a, b) => (b.series.date ?? '').localeCompare(a.series.date ?? ''));
    });
    this.message.set(foundMessage(this.seriesChoices(), found.length - kept.length, today));
    return found.length;
  }

  private initialScoring(): EditableScoring {
    const club = this.clubStore.club();
    const reading = this.reading();
    const shortCurrent = club?.shortSeriesDefaults ?? { discards: [3], dncCalculation: FALLBACK_DNC };
    const longCurrent = club?.longSeriesDefaults ?? { discards: [3], dncCalculation: { ...FALLBACK_DNC, excludeNeverRaced: true } };
    const short = reading ? scoringDefaultsFrom(reading.shortSeries, shortCurrent) : shortCurrent;
    const long = reading ? scoringDefaultsFrom(reading.longSeries, longCurrent) : longCurrent;
    const ood = reading
      ? oodFrom(reading, club?.oodScoring ?? { calculationCode: 'AvgAll', maxDuties: 1 })
      : club?.oodScoring ?? { calculationCode: 'AvgAll', maxDuties: 1 };
    return {
      shortDiscards: short.discards.join(', '),
      longDiscards: long.discards.join(', '),
      shortDnc: short.dncCalculation,
      longDnc: long.dncCalculation,
      oodCode: ood.calculationCode,
      maxDuties: ood.maxDuties,
    };
  }
}

function foundMessage(choices: readonly SeriesChoice[], olderCount: number, today: Date): string {
  const total = choices.length;
  const parts = [total === 1 ? 'Found 1 series.' : `Found ${total} series.`];
  if (olderCount > 0) {
    parts.push(olderCount === 1
      ? 'Left out 1 older than two years.'
      : `Left out ${olderCount} older than two years.`);
  }
  const undated = choices.filter(choice => seriesAge(choice.series, today) === 'undated').length;
  if (undated > 0) {
    parts.push(undated === 1
      ? '1 has no date and is unticked.'
      : `${undated} have no date and are unticked.`);
  }
  return parts.join(' ');
}

function readableError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : '';
  return message.includes(' ') ? message : fallback;
}

function staysOnForm(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return code.includes('invalid-argument') || code.includes('unauthenticated') || code.includes('permission-denied');
}

function seriesKey(series: SailwaveSeries): string {
  return `${series.title}|${series.raceHeaders.join(',')}|${series.competitors.length}`;
}

function parseMilestones(text: string): number[] | string {
  const parts = text.split(/[,\s]+/).map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  const numbers = parts.map(part => Number(part));
  if (numbers.some(value => !Number.isInteger(value) || value < 1)) {
    return 'Enter discard races as whole numbers, separated by commas.';
  }
  const issue = validateDiscardRaceSequence(numbers)[0];
  return issue ? issue.message : numbers;
}

export type { DraftBoat, DraftClass, DraftFleet, ScoringDefaults };
