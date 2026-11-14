import type { DncCalculation, OODScoring, ScoringDefaults } from 'app/club-tenant/model/club';
import { discardsForRaceIndex } from 'app/scoring/model/discard-profile';
import { observeDiscards, observeDnc, observeOod, type DiscardObservation, type DncObservation, type OodObservation } from './infer-scoring';
import type { SailwaveSeries } from './sailwave-series';
import type { SailingInstructionReading, SeriesScoringProposal } from './si-proposal';

export type CheckStatus = 'match' | 'disagree' | 'insufficient' | 'consistent';

export interface FieldCheck {
  status: CheckStatus;
  detail: string;
}

export interface ScoringCheck {
  discards: DiscardObservation[];
  dnc: DncObservation[];
  ood: OodObservation;
  shortDiscards: FieldCheck;
  longDiscards: FieldCheck;
  shortDnc: FieldCheck;
  longDnc: FieldCheck;
  oodCheck: FieldCheck;
}

export function checkScoring(reading: SailingInstructionReading, seriesList: readonly SailwaveSeries[]): ScoringCheck {
  const discards = observeDiscards(seriesList);
  const dnc = observeDnc(seriesList);
  const ood = observeOod(seriesList);
  return {
    discards,
    dnc,
    ood,
    shortDiscards: checkDiscards(reading.shortSeries, discards.filter(item => item.kind === 'short')),
    longDiscards: checkDiscards(reading.longSeries, discards.filter(item => item.kind === 'long')),
    shortDnc: checkDnc(reading.shortSeries, dnc.filter(item => item.kind === 'short')),
    longDnc: checkDnc(reading.longSeries, dnc.filter(item => item.kind === 'long')),
    oodCheck: checkOod(reading.ood, ood),
  };
}

export function scoringDefaultsFrom(
  proposal: SeriesScoringProposal,
  current: ScoringDefaults,
): ScoringDefaults {
  return {
    discards: proposal.discards ?? current.discards,
    dncCalculation: proposal.dnc ?? current.dncCalculation,
  };
}

export function oodFrom(reading: SailingInstructionReading, current: OODScoring): OODScoring {
  return {
    calculationCode: reading.ood.calculationCode ?? current.calculationCode,
    maxDuties: reading.ood.maxDuties ?? current.maxDuties,
  };
}

function checkDiscards(proposal: SeriesScoringProposal, observed: DiscardObservation[]): FieldCheck {
  if (!proposal.discards) return { status: 'insufficient', detail: 'Not in the sailing instructions.' };
  if (observed.length === 0) return { status: 'insufficient', detail: 'No discarded scores to check.' };
  const lines: string[] = [];
  let disagreed = false;
  let partial = false;
  for (const item of observed) {
    const allowed = discardsForRaceIndex({ discards: proposal.discards }, item.raceCount);
    const later = proposal.discards.some(milestone => milestone > item.raceCount);
    if (allowed !== item.discardCount) {
      disagreed = true;
      lines.push(`${item.title}: results discard ${item.discardCount} after ${item.raceCount} races; the instructions allow ${allowed}.`);
    } else if (later) {
      partial = true;
      lines.push(`${item.title}: agrees after ${item.raceCount} races. Later discards were not sailed.`);
    } else {
      lines.push(`${item.title}: agrees.`);
    }
  }
  return {
    status: disagreed ? 'disagree' : partial ? 'consistent' : 'match',
    detail: lines.join(' '),
  };
}

function checkDnc(proposal: SeriesScoringProposal, observed: DncObservation[]): FieldCheck {
  if (!proposal.dnc) return { status: 'insufficient', detail: 'Not in the sailing instructions.' };
  if (observed.length === 0) return { status: 'insufficient', detail: 'No series to check.' };
  const lines: string[] = [];
  let disagreed = false;
  let unchecked = false;
  for (const item of observed) {
    if (item.status === 'per-race' || item.status === 'unknown') {
      disagreed = true;
      lines.push(`${item.title}: ${item.detail}`);
      continue;
    }
    if (item.status !== 'matched' || !item.calculation) {
      unchecked = true;
      lines.push(`${item.title}: ${item.detail}`);
      continue;
    }
    if (sameDnc(proposal.dnc, item)) lines.push(`${item.title}: agrees.`);
    else {
      disagreed = true;
      lines.push(`${item.title}: results use ${describeDnc(item.calculation)}.`);
    }
  }
  return {
    status: disagreed ? 'disagree' : unchecked ? 'insufficient' : 'match',
    detail: lines.join(' '),
  };
}

function checkOod(proposal: SailingInstructionReading['ood'], observed: OodObservation): FieldCheck {
  if (!proposal.calculationCode) return { status: 'insufficient', detail: 'Not in the sailing instructions.' };
  if (observed.status !== 'matched' || !observed.calculationCode) {
    return { status: 'insufficient', detail: observed.detail };
  }
  if (observed.calculationCode !== proposal.calculationCode) {
    return { status: 'disagree', detail: `Results fit ${observed.calculationCode}. ${observed.detail}` };
  }
  if (proposal.maxDuties != null && observed.maxDuties != null && proposal.maxDuties !== observed.maxDuties) {
    return { status: 'disagree', detail: `Results count ${observed.maxDuties} duties. ${observed.detail}` };
  }
  return { status: observed.maxDuties == null ? 'consistent' : 'match', detail: observed.detail };
}

function sameDnc(proposal: DncCalculation, observed: DncObservation): boolean {
  const calculation = observed.calculation;
  if (!calculation) return false;
  if (calculation.basis !== proposal.basis || calculation.offset !== proposal.offset) return false;
  if (!observed.excludeNeverRacedKnown) return true;
  return calculation.excludeNeverRaced === proposal.excludeNeverRaced;
}

function describeDnc(calculation: DncCalculation): string {
  const basis = calculation.basis === 'SeriesEntries' ? 'series entries' : 'the largest race';
  return `${basis} + ${calculation.offset}`;
}
