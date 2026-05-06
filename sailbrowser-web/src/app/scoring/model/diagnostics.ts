export interface ScoringDiagnostics {
  countableEntryIds: string[];
  excludedOodOnlyEntryIds: string[];
  raceEligibility: { raceId: string; included: boolean; reason?: string }[];
}
