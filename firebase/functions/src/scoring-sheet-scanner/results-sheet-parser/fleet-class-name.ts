/** Subset of a club fleet document used to label a race in the scan prompt. */
export interface ClubFleetFields {
  id?: unknown;
  type?: unknown;
  boatClassId?: unknown;
  name?: unknown;
}

/**
 * Same naming as the web app `getFleetName`: BoatClass → boatClassId, otherwise `name`.
 */
export function fleetClassName(fleet: ClubFleetFields): string | undefined {
  if (fleet.type === "BoatClass") {
    return typeof fleet.boatClassId === "string" && fleet.boatClassId.trim()
      ? fleet.boatClassId
      : undefined;
  }
  return typeof fleet.name === "string" && fleet.name.trim() ? fleet.name : undefined;
}

/** Map of club fleet id → display class/name from the club `fleets` array. */
export function fleetNameMapFromClubData(fleets: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(fleets)) return map;
  for (const raw of fleets) {
    if (!raw || typeof raw !== "object") continue;
    const fleet = raw as ClubFleetFields;
    if (typeof fleet.id !== "string" || !fleet.id) continue;
    const name = fleetClassName(fleet);
    if (name) map.set(fleet.id, name);
  }
  return map;
}
