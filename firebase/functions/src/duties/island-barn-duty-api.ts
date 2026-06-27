import type { DutyMember } from "@shared/duty-member";

const DUTY_REGISTER_BASE =
  "https://membership.islandbarn.org.uk/events/admin/duty_register";

/** Parse JSON body from team_for_day (array or null). */
export function parseDutyTeamResponse(body: unknown): DutyMember[] | null {
  if (body === null) return null;
  if (!Array.isArray(body)) return null;

  const duties: DutyMember[] = [];
  for (const item of body) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row["name"] !== "string" || typeof row["role"] !== "string") continue;
    if (typeof row["ack_key"] !== "string") continue;
    duties.push({
      role: row["role"],
      name: row["name"],
      attending: row["attending"] === true,
      key: row["ack_key"],
    });
  }
  return duties;
}

export function buildTeamForDayUrl(apiKey: string, date?: string): string {
  const params = new URLSearchParams({ api_key: apiKey });
  if (date) params.set("date", date);
  return `${DUTY_REGISTER_BASE}/team_for_day.json?${params.toString()}`;
}

export function buildAttendanceUrl(
  apiKey: string,
  key: string,
  present: boolean,
): string {
  const params = new URLSearchParams({
    api_key: apiKey,
    ack_key: key,
    attending: present ? "1" : "0",
  });
  return `${DUTY_REGISTER_BASE}/attendance_for_day.json?${params.toString()}`;
}

async function readBodySnippet(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

/** Hide the api_key value so it never lands in logs. */
function redactApiKey(url: string): string {
  return url.replace(/(api_key=)[^&]*/, "$1***");
}

export async function fetchDutyTeam(
  apiKey: string,
  date?: string,
): Promise<DutyMember[] | null> {
  const url = buildTeamForDayUrl(apiKey, date);
  console.info("fetchDutyTeam: GET", redactApiKey(url));
  const response = await fetch(url);
  const rawBody = await response.text();
  console.info(
    `fetchDutyTeam: response HTTP ${response.status} body`,
    rawBody.slice(0, 2000),
  );
  if (!response.ok) {
    const snippet = rawBody.slice(0, 500).replace(/\s+/g, " ").trim();
    throw new Error(`Duty team fetch failed: HTTP ${response.status}${snippet ? ` - ${snippet}` : ""}`);
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Duty team fetch returned invalid JSON: ${message}`);
  }
  return parseDutyTeamResponse(body);
}

export async function postDutyAttendance(
  apiKey: string,
  key: string,
  attending: boolean,
): Promise<void> {
  const url = buildAttendanceUrl(apiKey, key, attending);
  console.info("postDutyAttendance: POST", redactApiKey(url));
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const snippet = await readBodySnippet(response);
    throw new Error(`Duty attendance update failed: HTTP ${response.status}${snippet ? ` - ${snippet}` : ""}`);
  }
}
