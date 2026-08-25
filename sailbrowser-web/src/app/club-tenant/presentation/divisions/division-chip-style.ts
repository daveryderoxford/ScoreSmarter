/** Picks black or white text depending on the perceived luminance of a hex colour. */
export function readableForegroundFor(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return '#000';
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000' : '#fff';
}
