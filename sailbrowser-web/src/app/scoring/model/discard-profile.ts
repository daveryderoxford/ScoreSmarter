/**
 * Default number of ladder rows seeded in the series form and discard editor (extend with “Add race” or when adding calendar races).
 * Kept modest so the UI stays small; stored profiles may grow up to {@link DISCARD_PROFILE_CAP}.
 */
export const DISCARD_PROFILE_DEFAULT_ROWS = 15;

export const DISCARD_PROFILE_CAP = 104;

/** Hardcoded app default for short-series scoring (first discard after 4 races, then +1 every 3). */
export function defaultShortSeriesDiscardTable(rows = DISCARD_PROFILE_DEFAULT_ROWS): number[] {
  return discardTableFromLegacy(4, 3, rows);
}

/** Hardcoded app default for long-series scoring (first discard after 6 races, then +1 every 3). */
export function defaultLongSeriesDiscardTable(rows = DISCARD_PROFILE_DEFAULT_ROWS): number[] {
  return discardTableFromLegacy(6, 3, rows);
}

/**
 * Build discard allowance after each race index using the legacy arithmetic rule.
 * `raceCount` is 1-based: index `i` in the result is allowance after `i + 1` races.
 */
export function discardTableFromLegacy(
  initialDiscardAfter: number,
  subsequentDiscardsEveryN: number,
  racesCount: number,
): number[] {
  const step = Math.max(1, subsequentDiscardsEveryN);
  const nRaces = Math.min(Math.max(0, racesCount), DISCARD_PROFILE_CAP);
  const out: number[] = [];
  for (let raceCount = 1; raceCount <= nRaces; raceCount++) {
    let v = 0;
    if (raceCount >= initialDiscardAfter) {
      v = 1 + Math.floor((raceCount - initialDiscardAfter) / step);
    }
    out.push(v);
  }
  return out;
}

/**
 * 1-based race numbers where allowed discard count increases vs the previous row (i.e. sailors “gain” another discard).
 */
export function racesWhereDiscardAllowanceIncreases(table: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < table.length; i++) {
    const v = table[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const prev = i === 0 ? 0 : Number(table[i - 1]);
    if (Number(v) > prev) {
      out.push(i + 1);
    }
  }
  return out;
}

/**
 * Builds the ordered trigger list implied by a dense discard ladder:
 * each +1 allowance at race R appends another R (non-decreasing sequence).
 */
export function triggerRacesFromDiscardLadder(table: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < table.length; i++) {
    const prev = i === 0 ? 0 : Number(table[i - 1]);
    const cur = Number(table[i]);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    const delta = cur - prev;
    if (delta <= 0) continue;
    const race = i + 1;
    const d = Math.min(delta, DISCARD_PROFILE_CAP); // safety
    for (let k = 0; k < d; k++) out.push(race);
  }
  return out;
}

/** Cumulative allowable discards after each race count = triggers with milestone ≤ race. */
export function discardLadderFromTriggerRaces(triggers: readonly number[], targetLength: number): number[] {
  const n = Math.min(Math.max(targetLength, 0), DISCARD_PROFILE_CAP);
  const sorted = [...triggers]
    .filter(t => typeof t === 'number' && Number.isFinite(t) && t >= 1 && t <= DISCARD_PROFILE_CAP)
    .sort((a, b) => a - b);
  const out: number[] = [];
  let j = 0;
  for (let race = 1; race <= n; race++) {
    while (j < sorted.length && sorted[j]! <= race) {
      j++;
    }
    out.push(j);
  }
  return out;
}

/** Row index is 1-based for messages. Empty list ⇒ valid. */
export function validateDiscardTriggerRaceSequence(triggers: readonly number[]): DiscardSeriesValidationIssue[] {
  const issues: DiscardSeriesValidationIssue[] = [];
  let prev = 1;
  for (let i = 0; i < triggers.length; i++) {
    const t = Number(triggers[i]);
    const rowIdx = i + 1;
    if (!Number.isFinite(t) || !Number.isInteger(t) || t < 1 || t > DISCARD_PROFILE_CAP) {
      issues.push({ raceIndex: rowIdx, message: 'After Race must be an integer within the ladder range.' });
      continue;
    }
    if (i > 0 && t < prev) {
      issues.push({
        raceIndex: rowIdx,
        message: 'Each discard must trigger on or after the previous row (later “After Race”).',
      });
    }
    prev = t;
  }
  return issues;
}

/** Short sentence for UI, e.g. `Discards at races 4, 7, 10`. */
export function formatDiscardScheduleSummary(table: readonly number[]): string {
  if (table.length === 0) {
    return 'No races in this schedule.';
  }
  const races = racesWhereDiscardAllowanceIncreases(table);
  if (races.length === 0) {
    return 'No discards in this range (all zero).';
  }
  return `Discards at races ${races.join(', ')}.`;
}

export function padDiscardTableToLength(table: readonly number[], targetLen: number): number[] {
  const n = Math.min(Math.max(targetLen, 0), DISCARD_PROFILE_CAP);
  if (table.length >= n) {
    return [...table.slice(0, n)];
  }
  const last = table.length > 0 ? table[table.length - 1]! : 0;
  const extra = Array(n - table.length).fill(last);
  return [...table, ...extra];
}

/** Series must carry a discard ladder ({@link hydrateSeriesFromFirestore} ensures this after reads). */
export function discardAllowanceAfterRaceCount(series: { discards: readonly number[] }, raceCount: number): number {
  if (raceCount <= 0) return 0;
  const cappedRace = Math.min(raceCount, DISCARD_PROFILE_CAP);
  const table = padDiscardTableToLength([...series.discards], cappedRace);
  return table[cappedRace - 1] ?? 0;
}

export interface DiscardSeriesValidationIssue {
  raceIndex: number;
  message: string;
}

/** True when the stored profile is explicit but shorter than the fixture after adding races → prompt user. */
export function seriesDiscardProfileNeedsExtension(series: { discards: readonly number[] }, newRaceTotal: number): boolean {
  const d = series.discards;
  return Array.isArray(d) && d.length > 0 && d.length < newRaceTotal;
}

export function validateDiscardTable(table: readonly number[]): DiscardSeriesValidationIssue[] {
  const issues: DiscardSeriesValidationIssue[] = [];
  let prevAllowance = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < table.length; i++) {
    const raceNo = i + 1;
    const v = table[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      issues.push({ raceIndex: raceNo, message: 'Must be a non-negative integer.' });
      continue;
    }
    if (v > raceNo) {
      issues.push({ raceIndex: raceNo, message: `Cannot exceed ${raceNo} (${raceNo} races sailed).` });
    }
    if (v < prevAllowance) {
      issues.push({
        raceIndex: raceNo,
        message:
          prevAllowance === Number.NEGATIVE_INFINITY
            ? 'Invalid discard row.'
            : `Must be at least ${prevAllowance} (non-decreasing).`,
      });
    }
    prevAllowance = v;
  }
  return issues;
}
