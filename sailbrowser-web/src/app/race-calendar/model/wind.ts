/** Compass points at 45° increments, clockwise from north. */
export const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export type WindDirection = (typeof WIND_DIRECTIONS)[number];

export interface Wind {
  /** Wind speed in knots. */
  windSpeed?: number;
  /** Direction the wind blows from. */
  windDirection?: WindDirection;
}

/** e.g. "SW 12 kts", "SW", "12 kts", or '' when neither is set. */
export function windLabel(wind: Wind): string {
  const speed = wind.windSpeed != null ? `${wind.windSpeed} kts` : '';
  return [wind.windDirection, speed].filter(Boolean).join(' ');
}
