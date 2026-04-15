export function groupBy<T, K extends string | number>(
  items: readonly T[],
  getKey: (item: T) => K
): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const bucket = out.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
}
