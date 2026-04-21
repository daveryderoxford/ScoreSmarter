export interface SuspectTimeRules {
  minElapsedSeconds: number;
  maxElapsedSeconds: number;
  minLapSeconds: number;
  maxLapSeconds: number;
}

export interface SuspectTimeThresholdOverrides {
  minElapsedMinutes?: number;
  maxElapsedMinutes?: number;
  minLapMinutes?: number;
  maxLapMinutes?: number;
}

export const DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES: Required<SuspectTimeThresholdOverrides> = {
  minElapsedMinutes: 5,
  maxElapsedMinutes: 180,
  minLapMinutes: 2,
  maxLapMinutes: 180,
};

const toSeconds = (minutes: number): number => Math.round(minutes * 60);

export function resolveSuspectTimeRules(
  overrides?: SuspectTimeThresholdOverrides,
): SuspectTimeRules {
  const mins = {
    ...DEFAULT_SUSPECT_TIME_THRESHOLDS_MINUTES,
    ...(overrides ?? {}),
  };
  return {
    minElapsedSeconds: toSeconds(mins.minElapsedMinutes),
    maxElapsedSeconds: toSeconds(mins.maxElapsedMinutes),
    minLapSeconds: toSeconds(mins.minLapMinutes),
    maxLapSeconds: toSeconds(mins.maxLapMinutes),
  };
}

export function isOutsideRange(value: number | undefined, min: number, max: number): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  return value < min || value > max;
}

export function isSuspectElapsedOrLapTime(
  elapsedSeconds: number | undefined,
  averageLapSeconds: number | undefined,
  rules: SuspectTimeRules,
): boolean {
  return (
    isOutsideRange(elapsedSeconds, rules.minElapsedSeconds, rules.maxElapsedSeconds) ||
    isOutsideRange(averageLapSeconds, rules.minLapSeconds, rules.maxLapSeconds)
  );
}

export function isSuspectIncludingCorrected(
  elapsedSeconds: number | undefined,
  averageLapSeconds: number | undefined,
  correctedSeconds: number | undefined,
  rules: SuspectTimeRules,
): boolean {
  return (
    isSuspectElapsedOrLapTime(elapsedSeconds, averageLapSeconds, rules) ||
    isOutsideRange(correctedSeconds, rules.minElapsedSeconds, rules.maxElapsedSeconds)
  );
}
