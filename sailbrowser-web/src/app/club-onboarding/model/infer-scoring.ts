import type { DncCalculation, OODScoring } from 'app/club-tenant/model/club';
import { sailedRaceCount, type SailwaveCompetitor, type SailwaveRaceCell, type SailwaveSeries } from './sailwave-series';

const DUTY_CODES = new Set(['OOD', 'DUTY', 'OD', 'RO', 'PRO']);
const POINTS_TOLERANCE = 0.15;

/** A series with eight or more races is checked against the long-series profile. */
export function seriesLengthKind(raceCount: number): 'long' | 'short' {
  return raceCount >= 8 ? 'long' : 'short';
}

export interface DiscardObservation {
  seriesId: string;
  title: string;
  kind: 'long' | 'short';
  raceCount: number;
  discardCount: number;
  boatsSampled: number;
}

export interface DncObservation {
  seriesId: string;
  title: string;
  kind: 'long' | 'short';
  status: 'matched' | 'ambiguous' | 'per-race' | 'unknown' | 'insufficient';
  calculation: DncCalculation | null;
  /** Set when everyone raced, so the results cannot show whether never-raced boats are excluded. */
  excludeNeverRacedKnown: boolean;
  observedPoints: number | null;
  detail: string;
}

export interface OodObservation {
  status: 'matched' | 'insufficient';
  calculationCode: OODScoring['calculationCode'] | null;
  /** Present when a boat's later duties fell back to the DNC score. */
  maxDuties: number | null;
  dutiesSampled: number;
  detail: string;
}

export function observeDiscards(seriesList: readonly SailwaveSeries[]): DiscardObservation[] {
  return seriesList.flatMap(series => {
    const observed = discardCountForSeries(series);
    if (!observed) return [];
    return [{
      seriesId: series.id,
      title: series.title,
      kind: seriesLengthKind(observed.raceCount),
      raceCount: observed.raceCount,
      discardCount: observed.discardCount,
      boatsSampled: observed.boatsSampled,
    }];
  });
}

export function observeDnc(seriesList: readonly SailwaveSeries[]): DncObservation[] {
  return seriesList.filter(series => series.kind === 'series').map(series => dncForSeries(series));
}

export function observeOod(seriesList: readonly SailwaveSeries[]): OodObservation {
  const samples: DutySample[] = [];
  for (const series of seriesList.filter(item => item.kind === 'series')) {
    const dncPoints = constantDncPoints(series);
    series.competitors.forEach((competitor, competitorIndex) => {
      const others = competitor.races.filter(cell =>
        !cell.blank && !isDuty(cell) && cell.code !== 'DNC' && cell.points != null);
      const avgAll = mean(others.map(cell => cell.points as number));
      const avgExcluding = mean(others.filter(cell => !cell.discarded).map(cell => cell.points as number));
      competitor.races.forEach((cell, raceIndex) => {
        if (!isDuty(cell) || cell.points == null) return;
        samples.push({
          boatKey: `${series.id}:${competitorIndex}`,
          raceIndex,
          points: cell.points,
          avgAll,
          avgExcluding,
          dncPoints,
        });
      });
    });
  }
  if (samples.length === 0) {
    return {
      status: 'insufficient',
      calculationCode: null,
      maxDuties: null,
      dutiesSampled: 0,
      detail: 'No OOD scores in the selected results.',
    };
  }

  let allCount = 0;
  let excludingCount = 0;
  let fixedCount = 0;
  for (const sample of samples) {
    const matchesAll = sample.avgAll != null && close(sample.points, sample.avgAll);
    const matchesExcluding = sample.avgExcluding != null && close(sample.points, sample.avgExcluding);
    const averagesDiffer = sample.avgAll != null && sample.avgExcluding != null && !close(sample.avgAll, sample.avgExcluding);
    if (matchesExcluding && averagesDiffer && !matchesAll) excludingCount++;
    else if (matchesAll) allCount++;
    else fixedCount++;
  }

  const calculationCode = excludingCount > allCount && excludingCount >= fixedCount
    ? 'AvgExcludingDiscards'
    : allCount >= fixedCount && allCount > 0
      ? 'AvgAll'
      : fixedCount > 0 && allCount === 0 && excludingCount === 0
        ? 'FixedScore'
        : null;
  const maxDuties = dutyCap(samples, calculationCode);
  const label = calculationCode === 'AvgExcludingDiscards'
    ? 'average excluding discards'
    : calculationCode === 'AvgAll'
      ? 'average of races sailed'
      : calculationCode === 'FixedScore'
        ? 'a fixed score'
        : 'no single duty rule';
  return {
    status: calculationCode ? 'matched' : 'insufficient',
    calculationCode,
    maxDuties,
    dutiesSampled: samples.length,
    detail: maxDuties == null
      ? `${samples.length} duty scores fit ${label}. No boat went past the duty cap.`
      : `${samples.length} duty scores fit ${label}, with ${maxDuties} counting.`,
  };
}

/** A race counts as sailed when the cell has a result other than DNC. */
export function racesSailed(races: readonly SailwaveRaceCell[]): number {
  return races.filter(cell => !cell.blank && cell.code !== 'DNC').length;
}

/** Sailwave's caption states the races sailed and the discards applied. The parentheses are the fallback. */
function discardCountForSeries(series: SailwaveSeries): { raceCount: number; discardCount: number; boatsSampled: number } | null {
  if (series.kind !== 'series') return null;
  const raceCount = sailedRaceCount(series);
  if (raceCount === 0) return null;
  const counts = series.competitors
    .filter(competitor => competitor.races.some(cell => !cell.blank))
    .map(competitor => competitor.races.filter(cell => cell.discarded && !cell.blank).length);
  if (series.caption?.discards != null) {
    return { raceCount, discardCount: series.caption.discards, boatsSampled: counts.length };
  }
  if (counts.length === 0) return null;
  const discardCount = mode(counts);
  if (discardCount == null) return null;
  return { raceCount, discardCount, boatsSampled: counts.length };
}

function dncForSeries(series: SailwaveSeries): DncObservation {
  const base = {
    seriesId: series.id,
    title: series.title,
    kind: seriesLengthKind(sailedRaceCount(series)),
  };
  const raceCount = series.raceHeaders.length;
  if (raceCount === 0 || series.competitors.length === 0) {
    return { ...base, status: 'insufficient', calculation: null, excludeNeverRacedKnown: false, observedPoints: null, detail: 'No results to check DNC.' };
  }

  const byRace: (number | null)[] = [];
  for (let raceIndex = 0; raceIndex < raceCount; raceIndex++) {
    byRace.push(dncPointsForRace(series.competitors, raceIndex));
  }
  const scoredRaces = byRace.flatMap((points, raceIndex) => points == null ? [] : [{ raceIndex, points }]);
  if (scoredRaces.length === 0) {
    return { ...base, status: 'insufficient', calculation: null, excludeNeverRacedKnown: false, observedPoints: null, detail: 'No DNC scores in this series.' };
  }

  const entries = series.caption?.entries ?? series.competitors.length;
  const raced = series.competitors.filter(competitor => racesSailed(competitor.races) > 0).length;
  const starters = byRace.map((_, raceIndex) => starterCount(series.competitors, raceIndex));
  const maxStarters = Math.max(...starters);
  const samePoints = scoredRaces.every(race => close(race.points, scoredRaces[0].points));

  if (!samePoints) {
    const perRace = scoredRaces.every(race =>
      close(race.points, starters[race.raceIndex] + 1) || close(race.points, starters[race.raceIndex] + 2));
    return {
      ...base,
      status: perRace ? 'per-race' : 'unknown',
      calculation: null,
      excludeNeverRacedKnown: false,
      observedPoints: null,
      detail: perRace
        ? 'DNC points follow the starters in each race. The defaults screen cannot store that rule.'
        : 'DNC points change by race and do not match a stored rule.',
    };
  }

  const points = scoredRaces[0].points;
  const candidates: DncCalculation[] = [];
  if (close(points, entries + 1)) {
    candidates.push({ basis: 'SeriesEntries', offset: 1, excludeNeverRaced: false });
  }
  if (raced !== entries && close(points, raced + 1)) {
    candidates.push({ basis: 'SeriesEntries', offset: 1, excludeNeverRaced: true });
  }
  if (close(points, maxStarters + 1)) {
    candidates.push({ basis: 'MaxRaceCompetitors', offset: 1, excludeNeverRaced: false });
  }
  if (close(points, maxStarters + 2)) {
    candidates.push({ basis: 'MaxRaceCompetitors', offset: 2, excludeNeverRaced: false });
  }
  if (candidates.length === 1) {
    return {
      ...base,
      status: 'matched',
      calculation: candidates[0],
      excludeNeverRacedKnown: raced !== entries || candidates[0].basis !== 'SeriesEntries',
      observedPoints: points,
      detail: dncDetail(candidates[0], points),
    };
  }
  if (candidates.length > 1) {
    return {
      ...base,
      status: 'ambiguous',
      calculation: null,
      excludeNeverRacedKnown: false,
      observedPoints: points,
      detail: `DNC points are ${points}, which matches more than one rule.`,
    };
  }
  return {
    ...base,
    status: 'unknown',
    calculation: null,
    excludeNeverRacedKnown: false,
    observedPoints: points,
    detail: `DNC points are ${points}, which does not match a stored rule.`,
  };
}

function dncDetail(calculation: DncCalculation, points: number): string {
  const basis = calculation.basis === 'SeriesEntries' ? 'series entries' : 'the largest race';
  const exclusion = calculation.excludeNeverRaced ? ', excluding boats that never raced' : '';
  return `DNC points are ${points}: ${basis} + ${calculation.offset}${exclusion}.`;
}

function dncPointsForRace(competitors: readonly SailwaveCompetitor[], raceIndex: number): number | null {
  const points = competitors
    .map(competitor => competitor.races[raceIndex])
    .filter((cell): cell is SailwaveRaceCell => !!cell && cell.code === 'DNC' && cell.points != null)
    .map(cell => cell.points as number);
  if (points.length === 0) return null;
  if (points.some(value => !close(value, points[0]))) return null;
  return points[0];
}

function constantDncPoints(series: SailwaveSeries): number | null {
  const points = series.competitors.flatMap(competitor =>
    competitor.races.filter(cell => cell.code === 'DNC' && cell.points != null).map(cell => cell.points as number));
  if (points.length === 0) return null;
  if (points.some(value => !close(value, points[0]))) return null;
  return points[0];
}

function starterCount(competitors: readonly SailwaveCompetitor[], raceIndex: number): number {
  return competitors.filter(competitor => {
    const cell = competitor.races[raceIndex];
    return !!cell && !cell.blank && cell.code !== 'DNC' && !isDuty(cell);
  }).length;
}

interface DutySample {
  boatKey: string;
  raceIndex: number;
  points: number;
  avgAll: number | null;
  avgExcluding: number | null;
  dncPoints: number | null;
}

function dutyCap(samples: DutySample[], calculationCode: OODScoring['calculationCode'] | null): number | null {
  if (!calculationCode || calculationCode === 'FixedScore') return null;
  const byBoat = new Map<string, DutySample[]>();
  for (const sample of samples) {
    const list = byBoat.get(sample.boatKey) ?? [];
    list.push(sample);
    byBoat.set(sample.boatKey, list);
  }
  const caps: number[] = [];
  for (const duties of byBoat.values()) {
    const ordered = [...duties].sort((a, b) => a.raceIndex - b.raceIndex);
    let counted = 0;
    for (const duty of ordered) {
      const target = calculationCode === 'AvgExcludingDiscards' ? duty.avgExcluding : duty.avgAll;
      if (target != null && close(duty.points, target)) {
        counted++;
        continue;
      }
      if (duty.dncPoints != null && close(duty.points, duty.dncPoints) && counted > 0) caps.push(counted);
      break;
    }
  }
  if (caps.length === 0) return null;
  return Math.min(...caps);
}

function isDuty(cell: SailwaveRaceCell): boolean {
  return cell.code != null && DUTY_CODES.has(cell.code);
}

function mode(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= POINTS_TOLERANCE;
}
