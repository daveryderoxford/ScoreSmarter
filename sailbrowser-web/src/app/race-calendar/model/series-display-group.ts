/** The distinct display groups of `items`, sorted. */
export function distinctDisplayGroups(items: readonly { displayGroup?: string }[]): string[] {
  const groups = new Set(items.map(i => i.displayGroup?.trim()).filter((g): g is string => !!g));
  return [...groups].sort((a, b) => a.localeCompare(b));
}

/** Existing groups containing `typed` (ignoring case), excluding an exact match. */
export function displayGroupSuggestions(groups: readonly string[], typed: string): string[] {
  const term = typed.trim().toLowerCase();
  return groups.filter(g => g.toLowerCase().includes(term) && g.toLowerCase() !== term);
}
