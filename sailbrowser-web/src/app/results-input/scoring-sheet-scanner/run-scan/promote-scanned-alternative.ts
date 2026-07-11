import type { ScannedResultRow, ScannedValue } from '../model/scan-model';

export type ScannedValueField = 'sailNumber' | 'boatClass' | 'competitorName' | 'time' | 'laps';

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

export function promoteRowAlternative(
  row: ScannedResultRow,
  field: ScannedValueField,
  chosen: string | number,
): ScannedResultRow {
  const current = row[field];
  if (!current) return row;

  if (field === 'laps') {
    const next = promoteScannedAlternative(current as ScannedValue<number>, Number(chosen));
    return next === current ? row : { ...row, laps: next };
  }

  const next = promoteScannedAlternative(current as ScannedValue<string>, String(chosen));
  if (next === current) return row;
  return { ...row, [field]: next };
}
