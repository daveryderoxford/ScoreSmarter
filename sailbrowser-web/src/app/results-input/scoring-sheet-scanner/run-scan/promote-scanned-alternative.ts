import type { ScannedResultRow, ScannedValue } from '../model/scan-model';

export type ScannedValueField =
  | 'sailNumber'
  | 'boatClass'
  | 'competitorName'
  | 'time'
  | 'laps'
  | 'position';

/** Promote `chosen` to primary value; previous primary joins the remaining alternatives. */
export function promoteScannedAlternative<T>(
  field: ScannedValue<T> | undefined,
  chosen: T,
): ScannedValue<T> | undefined {
  if (!field) return field;
  if (Object.is(field.value, chosen) || field.value === chosen) return field;

  const rest = (field.alternatives ?? []).filter(alt => alt !== chosen && !Object.is(alt, chosen));
  return {
    ...field,
    value: chosen,
    alternatives: [field.value, ...rest],
  };
}

/**
 * Promote an alternative on a row. Changing the class or sail number clears an
 * earlier link or staged entry, because they were chosen for the old values.
 */
export function promoteRowAlternative(
  row: ScannedResultRow,
  field: ScannedValueField,
  chosen: string | number,
): ScannedResultRow {
  const current = row[field];
  if (!current) return row;

  if (field === 'laps' || field === 'position') {
    const next = promoteScannedAlternative(current as ScannedValue<number>, Number(chosen));
    return next === current ? row : { ...row, [field]: next };
  }

  const next = promoteScannedAlternative(current as ScannedValue<string>, String(chosen));
  if (next === current) return row;
  const promoted = { ...row, [field]: next };
  return field === 'boatClass' || field === 'sailNumber' ? withoutRowChoices(promoted) : promoted;
}

/**
 * Replace the row's class and sail number with values the user typed. The scanned
 * values stay as alternatives, and any earlier link or staged entry is cleared.
 */
export function replaceRowIdentity(
  row: ScannedResultRow,
  identity: { boatClass: string; sailNumber: string },
): ScannedResultRow {
  return {
    ...withoutRowChoices(row),
    boatClass: userValue(row.boatClass, identity.boatClass),
    sailNumber: userValue(row.sailNumber, identity.sailNumber),
  };
}

export function withoutRowChoices(row: ScannedResultRow): ScannedResultRow {
  const next = { ...row };
  delete next.pendingEntry;
  delete next.matchedCompetitorId;
  return next;
}

function userValue(field: ScannedValue<string> | undefined, value: string): ScannedValue<string> {
  if (!field) return { value, confidence: 'HIGH' };
  const alternatives = [field.value, ...(field.alternatives ?? [])]
    .filter((alt, i, all) => !!alt && alt !== value && all.indexOf(alt) === i);
  return { value, confidence: 'HIGH', alternatives };
}
