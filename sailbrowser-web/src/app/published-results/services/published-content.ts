/**
 * Content of a Firestore document as stored, for change detection: dates and timestamps
 * become milliseconds, `null`/`undefined` fields are dropped (the converter writes
 * `undefined` as `null` and reads `null` back as `undefined`), and object keys are sorted.
 */
function comparable(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis();
  }
  if (Array.isArray(value)) return value.map(item => comparable(item) ?? null);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = comparable((value as Record<string, unknown>)[key]);
      if (item !== undefined) out[key] = item;
    }
    return out;
  }
  return value;
}

/** True when writing `next` over `stored` would not change the stored document. */
export function samePublishedContent(next: unknown, stored: unknown): boolean {
  return JSON.stringify(comparable(next)) === JSON.stringify(comparable(stored));
}
