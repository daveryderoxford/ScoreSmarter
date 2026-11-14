import { randomUUID } from "crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { logger } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { assertAuthenticated, assertCallerRole } from "../shared/authorisation.js";
import { detailedHttpsError } from "../shared/https-error.js";
import {
  decodeHtml,
  fetchSailwavePages,
  SAILWAVE_FETCH_LIMITS,
  type FetchedBody,
} from "./sailwave-fetch.js";

const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-GB,en;q=0.9",
};

export const fetchSailwaveResults = onCall({
  memory: "512MiB",
  timeoutSeconds: 120,
}, async (request) => {
  const requestId = randomUUID();
  assertAuthenticated(request.auth, { requestId });

  const data = request.data as { clubId?: unknown; url?: unknown; indexHtml?: unknown };
  const clubId = typeof data.clubId === "string" ? data.clubId.trim() : "";
  if (!clubId) {
    throw detailedHttpsError("invalid-argument", "Missing clubId.", {
      requestId,
      stage: "validate_input",
      cause: "missing_club_id",
    });
  }
  assertCallerRole("club-admin", request.auth, clubId);
  const url = typeof data.url === "string" ? data.url : "";
  const indexHtml = typeof data.indexHtml === "string" ? data.indexHtml : undefined;
  if (indexHtml != null && Buffer.byteLength(indexHtml) > SAILWAVE_FETCH_LIMITS.pageBytes) {
    throw detailedHttpsError("invalid-argument", "The saved results page is too large.", {
      requestId,
      stage: "validate_input",
      cause: "index_html_too_large",
    });
  }

  const outcome = await fetchSailwavePages(url, {
    lookup: lookupPublic,
    request: browserRequest,
  }, { indexHtml });
  if (outcome.ok) {
    logger.info("fetchSailwaveResults: pages fetched", {
      requestId,
      clubId,
      url,
      savedIndex: indexHtml != null,
      pages: outcome.pages.length,
      linksTried: outcome.linksTried,
    });
    return { ok: true as const, pages: outcome.pages };
  }
  const { ok: _ok, ...diagnostics } = outcome;
  logger.warn("fetchSailwaveResults: no pages", { requestId, clubId, url, savedIndex: indexHtml != null, ...diagnostics });
  if (outcome.reason === "rejected") {
    throw detailedHttpsError("invalid-argument", outcome.detail, {
      requestId,
      stage: "validate_input",
    });
  }
  return { ok: false as const, detail: outcome.detail };
});

async function lookupPublic(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function browserRequest(url: string, signal: AbortSignal): Promise<FetchedBody> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: BROWSER_HEADERS,
    signal,
  });
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    return { status: response.status, location, body: "" };
  }
  const bytes = await readCapped(response);
  return { status: response.status, location, body: decodeHtml(bytes, response.headers.get("content-type")) };
}

async function readCapped(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > SAILWAVE_FETCH_LIMITS.pageBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(step.value);
  }
  return Buffer.concat(chunks);
}
