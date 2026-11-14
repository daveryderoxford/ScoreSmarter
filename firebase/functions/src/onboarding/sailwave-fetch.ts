import { isIP } from "node:net";

const PAGE_CAP = 80;
const PAGE_BYTES = 1_500_000;
const TOTAL_BYTES = 12_000_000;
const REDIRECT_CAP = 4;
const LINK_CAP = 120;
const CONCURRENCY = 6;
const RECENT_YEARS = 2;

const BLOCKED_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i;
const SAILWAVE_MARK = /sailno|summarytable|col class=["']?race|Sailwave/i;
const CHALLENGE_MARK = /cf-browser-verification|cf-challenge|g-recaptcha|just a moment|attention required|checking your browser/i;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const HREF = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i;
const YEAR = /(?<!\d)(?:19|20)\d{2}(?!\d)/g;
/** Clubs often publish series on sailwave.com and link to it from their own results page. */
const SAILWAVE_HOSTS = /(^|\.)sailwave\.com$/i;
const SECOND_LEVEL = /^(co|org|ac|gov|ltd|plc|me|net|sch|com)$/;

const BLOCKED_DETAIL = "The results site did not return the pages. It may be asking for a browser check or a login.";
const NONE_DETAIL = "No Sailwave results pages were found at that address.";

export interface FetchedBody {
  status: number;
  location: string | null;
  body: string;
}

export interface SailwaveFetchDeps {
  lookup(hostname: string): Promise<string[]>;
  request(url: string, signal: AbortSignal): Promise<FetchedBody>;
}

export interface SailwavePage {
  url: string;
  html: string;
}

/** Logged by the callable, not sent to the browser. */
export interface FetchDiagnostics {
  failedUrl?: string;
  status?: number;
  cause?: string;
  linksTried?: number;
}

export type SailwaveFetchOutcome =
  | { ok: true; pages: SailwavePage[]; linksTried: number }
  | ({ ok: false; reason: "rejected" | "blocked"; detail: string } & FetchDiagnostics);

export interface SailwaveFetchOptions {
  now?: () => number;
  /**
   * The results page as the admin saved it, for a site that refuses the server.
   * The address is then only the base for its links and is not fetched.
   */
  indexHtml?: string;
}

/**
 * Fetches one public https results index and the Sailwave pages linked from it, on the
 * club's own site or on sailwave.com. Newest links first; links that name only older years
 * are skipped. Parsing stays in the browser.
 */
export async function fetchSailwavePages(
  indexText: string,
  deps: SailwaveFetchDeps,
  options: SailwaveFetchOptions = {},
): Promise<SailwaveFetchOutcome> {
  const now = options.now ?? Date.now;
  const start = checkedUrl(indexText);
  if (!start.ok) return start.failure;

  const deadline = now() + 90_000;
  const pages: SailwavePage[] = [];
  let index: { url: string; body: string };
  if (options.indexHtml != null) {
    index = { url: start.url.href, body: options.indexHtml };
  } else {
    const fetched = await follow(start.url, deps, deadline, true, now);
    if (!fetched.ok) return fetched;
    if (isChallenge(fetched.body)) {
      return { ok: false, reason: "blocked", detail: BLOCKED_DETAIL, failedUrl: fetched.url, cause: "challenge_page" };
    }
    index = fetched;
    if (looksLikeSailwave(index.body) && Buffer.byteLength(index.body) <= TOTAL_BYTES) {
      pages.push({ url: index.url, html: index.body });
    }
  }

  const base = new URL(index.url);
  const oldestYear = new Date(now()).getUTCFullYear() - RECENT_YEARS;
  const links = seriesLinks(index.body, base, oldestYear).slice(0, Math.max(0, LINK_CAP - pages.length));
  await collectLinked(links, deps, deadline, pages, now);

  if (pages.length === 0) {
    return { ok: false, reason: "blocked", detail: NONE_DETAIL, failedUrl: index.url, cause: "no_sailwave_pages", linksTried: links.length };
  }
  return { ok: true, pages, linksTried: links.length };
}

export function isPublicIp(address: string): boolean {
  const ip = address.trim().toLowerCase();
  const mapped = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  if (mapped.includes(".")) return isPublicIpv4(mapped);
  return isPublicIpv6(ip);
}

export function looksLikeSailwave(html: string): boolean {
  return SAILWAVE_MARK.test(html);
}

/** Decodes by the Content-Type charset, then a meta charset. Sailwave declares ISO-8859-1 in a meta tag. */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const fromMeta = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const declared = (fromHeader ?? fromMeta ?? "").toLowerCase();
  if (declared && declared !== "utf-8" && declared !== "utf8") {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      return new TextDecoder("latin1").decode(bytes);
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}

function checkedUrl(value: string): { ok: true; url: URL } | { ok: false; failure: SailwaveFetchOutcome } {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, failure: { ok: false, reason: "rejected", detail: "Enter the full https address of the results page." } };
  }
  if (url.username || url.password) {
    return { ok: false, failure: { ok: false, reason: "rejected", detail: "The results address cannot include a username or password." } };
  }
  if (url.protocol !== "https:") {
    return { ok: false, failure: { ok: false, reason: "rejected", detail: "Enter an https address for the results page." } };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || BLOCKED_HOST.test(host) || /^\d+$/.test(host) || (isIP(host) && !isPublicIp(host))) {
    return { ok: false, failure: { ok: false, reason: "rejected", detail: "That address cannot be fetched." } };
  }
  url.hash = "";
  return { ok: true, url };
}

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const a = parts[0];
  const b = parts[1];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return false;
  const head = Number.parseInt(ip.split(":")[0] || "0", 16);
  if (!Number.isFinite(head)) return false;
  if ((head & 0xfe00) === 0xfc00) return false;
  if ((head & 0xffc0) === 0xfe80) return false;
  if ((head & 0xff00) === 0xff00) return false;
  if (ip.startsWith("2001:db8")) return false;
  return true;
}

type FollowResult =
  | { ok: true; url: string; body: string }
  | ({ ok: false; reason: "rejected" | "blocked"; detail: string } & FetchDiagnostics);

async function follow(
  start: URL,
  deps: SailwaveFetchDeps,
  deadline: number,
  initial: boolean,
  now: () => number,
): Promise<FollowResult> {
  let current = start;
  for (let hop = 0; hop <= REDIRECT_CAP; hop++) {
    if (now() > deadline) {
      return { ok: false, reason: "blocked", detail: "The results site took too long to respond." };
    }
    const gate = await allow(current, deps, initial && hop === 0);
    if (!gate.ok) return gate;

    let response: FetchedBody;
    try {
      response = await deps.request(current.href, AbortSignal.timeout(12_000));
    } catch (error: unknown) {
      return {
        ok: false,
        reason: "blocked",
        detail: "The results site could not be reached.",
        failedUrl: current.href,
        cause: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }

    const failedAt = { failedUrl: current.href, status: response.status };
    if (response.status >= 300 && response.status < 400) {
      const next = redirectTarget(response.location, current);
      if (!next.ok) return { ...next.failure, ...failedAt };
      current = next.url;
      continue;
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return { ok: false, reason: "blocked", detail: BLOCKED_DETAIL, ...failedAt };
    }
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, reason: "blocked", detail: "The results site did not return the pages.", ...failedAt };
    }
    return { ok: true, url: current.href, body: response.body };
  }
  return { ok: false, reason: "blocked", detail: "The results site redirected too many times." };
}

async function allow(
  url: URL,
  deps: SailwaveFetchDeps,
  initial: boolean,
): Promise<{ ok: true } | FollowResult> {
  const checked = checkedUrl(url.href);
  if (!checked.ok) {
    return initial
      ? checked.failure
      : { ok: false, reason: "blocked", detail: "The results site redirected to an address that cannot be fetched." };
  }
  let addresses: string[];
  try {
    addresses = await deps.lookup(url.hostname);
  } catch {
    return {
      ok: false,
      reason: initial ? "rejected" : "blocked",
      detail: "That results address could not be found.",
    };
  }
  if (addresses.length === 0 || addresses.some((address) => !isPublicIp(address))) {
    return {
      ok: false,
      reason: initial ? "rejected" : "blocked",
      detail: "That address cannot be fetched.",
    };
  }
  return { ok: true };
}

function redirectTarget(
  location: string | null,
  current: URL,
): { ok: true; url: URL } | { ok: false; failure: FollowResult } {
  if (!location) {
    return { ok: false, failure: { ok: false, reason: "blocked", detail: "The results site redirected without a destination." } };
  }
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    return { ok: false, failure: { ok: false, reason: "blocked", detail: "The results site redirected to an invalid address." } };
  }
  next.hash = "";
  if (next.protocol !== "https:") {
    return { ok: false, failure: { ok: false, reason: "blocked", detail: "The results site redirected away from https." } };
  }
  return { ok: true, url: next };
}

function isChallenge(html: string): boolean {
  if (looksLikeSailwave(html)) return false;
  return CHALLENGE_MARK.test(html.slice(0, 12_000));
}

function seriesLinks(html: string, base: URL, oldestYear: number): URL[] {
  const found: { url: URL; year: number | null; order: number }[] = [];
  const seen = new Set<string>([normalPage(base)]);
  for (const anchor of html.matchAll(ANCHOR)) {
    const href = anchor[1].match(HREF);
    const raw = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim().replace(/&amp;/gi, "&");
    if (!raw || raw.startsWith("#") || /^(javascript|mailto|data|tel):/i.test(raw)) continue;
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || !linkedHostAllowed(url, base)) continue;
    url.hash = "";
    const key = normalPage(url);
    if (seen.has(key) || !isSeriesLink(url)) continue;
    const text = anchor[2].replace(/<[^>]*>/g, " ");
    const years = [...`${text} ${url.pathname}`.matchAll(YEAR)].map((match) => Number(match[0]));
    const year = years.length > 0 ? Math.max(...years) : null;
    if (year != null && year < oldestYear) continue;
    seen.add(key);
    found.push({ url, year, order: found.length });
  }
  return found
    .sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || a.order - b.order)
    .map((item) => item.url);
}

function linkedHostAllowed(url: URL, base: URL): boolean {
  if (url.host === base.host) return true;
  if (SAILWAVE_HOSTS.test(url.hostname)) return true;
  return siteOf(url.hostname) === siteOf(base.hostname);
}

/** The registrable part of a host, close enough for `results.club.org.uk` and `www.club.org.uk`. */
function siteOf(hostname: string): string {
  const labels = hostname.toLowerCase().split(".");
  const keep = labels.length >= 3 && labels[labels.length - 1].length === 2 &&
    SECOND_LEVEL.test(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

function isSeriesLink(url: URL): boolean {
  if (/\.(css|js|png|jpe?g|gif|svg|pdf|xml|json|zip|ico|webp)$/i.test(url.pathname)) return false;
  return /\.s?html?$/i.test(url.pathname) || /result|sailwave|series/i.test(url.pathname + url.search);
}

function normalPage(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}`;
}

async function collectLinked(
  links: URL[],
  deps: SailwaveFetchDeps,
  deadline: number,
  pages: SailwavePage[],
  now: () => number,
): Promise<void> {
  let total = pages.reduce((sum, page) => sum + Buffer.byteLength(page.html), 0);
  let cursor = 0;
  const running: Promise<void>[] = [];

  const launch = (): void => {
    while (
      running.length < CONCURRENCY &&
      cursor < links.length &&
      pages.length < PAGE_CAP &&
      total < TOTAL_BYTES &&
      now() < deadline
    ) {
      const link = links[cursor];
      cursor += 1;
      const task = follow(link, deps, deadline, false, now).then((result) => {
        if (!result.ok || !looksLikeSailwave(result.body)) return;
        const size = Buffer.byteLength(result.body);
        if (pages.length >= PAGE_CAP || total + size > TOTAL_BYTES) return;
        total += size;
        pages.push({ url: result.url, html: result.body });
      }).finally(() => {
        const index = running.indexOf(task);
        if (index >= 0) running.splice(index, 1);
      });
      running.push(task);
    }
  };

  launch();
  while (running.length > 0) {
    await Promise.race(running);
    launch();
  }
}

export const SAILWAVE_FETCH_LIMITS = { pageCap: PAGE_CAP, pageBytes: PAGE_BYTES, totalBytes: TOTAL_BYTES };
