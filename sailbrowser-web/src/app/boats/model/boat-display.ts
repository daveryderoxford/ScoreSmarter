import { normaliseString } from 'app/shared/utils/string-utils';

export interface EntrySearchLabelParts {
  boatName?: string | null;
  boatClass: string;
  sailNumber: string | number;
  helm: string;
}

/** Trimmed boat name, or undefined when blank. */
export function trimBoatName(name: string | undefined | null): string | undefined {
  const trimmed = name?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Competitor search option label. When a boat name is set:
 * `Flying Fish · J/109 · GBR1234 - Sam Helm`
 */
export function formatEntrySearchLabel(parts: EntrySearchLabelParts): string {
  const name = trimBoatName(parts.boatName);
  if (name) {
    return `${name} · ${parts.boatClass} · ${parts.sailNumber} - ${parts.helm}`;
  }
  return `${parts.boatClass} ${parts.sailNumber} - ${parts.helm}`;
}

/** Normalised haystack for entry autocomplete filtering. */
export function entrySearchHaystack(parts: EntrySearchLabelParts): string {
  return normaliseString(
    [parts.boatName, parts.boatClass, parts.sailNumber, parts.helm]
      .filter(v => v != null && String(v).trim())
      .join(' '),
  );
}

/** Boat picker option without helm (e.g. member/club boat search). */
export function formatBoatOptionLabel(
  parts: Pick<EntrySearchLabelParts, 'boatName' | 'boatClass' | 'sailNumber'>,
): string {
  const name = trimBoatName(parts.boatName);
  if (name) {
    return `${name} · ${parts.boatClass} · ${parts.sailNumber}`;
  }
  return `${parts.boatClass} ${parts.sailNumber}`;
}
