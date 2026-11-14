import * as assert from "node:assert/strict";
import test from "node:test";
import {
  decodeHtml,
  fetchSailwavePages,
  isPublicIp,
  type FetchedBody,
  type SailwaveFetchDeps,
} from "./sailwave-fetch.js";

const PUBLIC = "93.184.216.34";
const SAILWAVE = "<table><col class=\"sailno\"><col class=\"race\">Sailwave</table>";

function deps(
  bodies: Record<string, FetchedBody>,
  lookup: SailwaveFetchDeps["lookup"] = async () => [PUBLIC],
): SailwaveFetchDeps & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    lookup,
    request: async (url) => {
      requested.push(url);
      const found = bodies[url];
      if (!found) return { status: 404, location: null, body: "missing" };
      return found;
    },
  };
}

test("keeps same-host Sailwave pages and skips other hosts and other files", async () => {
  const index = [
    "<a href=\"spring.htm\">Spring</a>",
    "<a href=\"notes.pdf\">Notes</a>",
    "<a href=\"https://other.example/series.htm\">Away</a>",
    "<a href=\"style.css\">Style</a>",
  ].join("");
  const client = deps({
    "https://club.example/results/": { status: 200, location: null, body: index },
    "https://club.example/results/spring.htm": { status: 200, location: null, body: SAILWAVE },
  });

  const outcome = await fetchSailwavePages("https://club.example/results/", client);

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(outcome.pages.map((page) => page.url), ["https://club.example/results/spring.htm"]);
  assert.deepEqual(client.requested, [
    "https://club.example/results/",
    "https://club.example/results/spring.htm",
  ]);
});

test("follows links to sailwave.com, newest first, and skips links that name only older years", async () => {
  const index = [
    "<a href=\"https://www.sailwave.com/results/northampton/solo2020.htm\">2020 Solo Series</a>",
    "<a href=\"https://sailwave.com/results/2025WinterSundays.htm\">2025 Winter Sundays</a>",
    "<a href=\"https://www.sailwave.com/results/northampton/soloautumn.htm\" target=\"_blank\">2026 Solo <b>Autumn</b></a>",
    "<a href=\"https://elsewhere.example/2026.htm\">2026 Elsewhere</a>",
  ].join("");
  const client = deps({
    "https://club.example/results/": { status: 200, location: null, body: index },
    "https://sailwave.com/results/2025WinterSundays.htm": { status: 200, location: null, body: SAILWAVE },
    "https://www.sailwave.com/results/northampton/soloautumn.htm": { status: 200, location: null, body: SAILWAVE },
  });

  const now = () => Date.UTC(2026, 10, 8);
  const outcome = await fetchSailwavePages("https://club.example/results/", client, { now });

  assert.equal(outcome.ok, true);
  assert.deepEqual(client.requested, [
    "https://club.example/results/",
    "https://www.sailwave.com/results/northampton/soloautumn.htm",
    "https://sailwave.com/results/2025WinterSundays.htm",
  ]);
});

test("reads links from a saved results page without fetching the address", async () => {
  const saved = "<a href=\"https://sailwave.com/results/2026LateSummerSundaySeries.htm\">2026 Late Summer</a>";
  const client = deps({
    "https://sailwave.com/results/2026LateSummerSundaySeries.htm": { status: 200, location: null, body: SAILWAVE },
  });
  const outcome = await fetchSailwavePages("https://northamptonsailingclub.org/results/", client, { indexHtml: saved });
  assert.equal(outcome.ok, true);
  assert.deepEqual(client.requested, ["https://sailwave.com/results/2026LateSummerSundaySeries.htm"]);
});

test("follows links to another host on the club's own site", async () => {
  const client = deps({
    "https://www.club.org.uk/racing/": {
      status: 200,
      location: null,
      body: "<a href=\"https://results.club.org.uk/spring.htm\">Spring</a>",
    },
    "https://results.club.org.uk/spring.htm": { status: 200, location: null, body: SAILWAVE },
  });
  const outcome = await fetchSailwavePages("https://www.club.org.uk/racing/", client);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.pages[0].url, "https://results.club.org.uk/spring.htm");
});

test("decodes a page by its meta charset", () => {
  const html = "<meta http-equiv=\"Content-Type\" content=\"text/html;charset=ISO-8859-1\"/><th>\x96WS01</th>";
  const bytes = Uint8Array.from(html, (character) => character.charCodeAt(0));
  assert.match(decodeHtml(bytes, "text/html"), /\u2013WS01/);
  assert.equal(decodeHtml(new TextEncoder().encode("<p>Café</p>"), "text/html; charset=utf-8"), "<p>Café</p>");
});

test("includes the index when it is a Sailwave page", async () => {
  const client = deps({
    "https://club.example/spring.htm": { status: 200, location: null, body: SAILWAVE },
  });
  const outcome = await fetchSailwavePages("https://club.example/spring.htm", client);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.pages.length, 1);
  assert.equal(outcome.pages[0].url, "https://club.example/spring.htm");
});

test("follows a same-site https redirect before reading links", async () => {
  const client = deps({
    "https://www.club.example/results": {
      status: 302,
      location: "https://club.example/results/",
      body: "",
    },
    "https://club.example/results/": {
      status: 200,
      location: null,
      body: "<a href=\"spring.htm\">Spring</a>",
    },
    "https://club.example/results/spring.htm": { status: 200, location: null, body: SAILWAVE },
  });

  const outcome = await fetchSailwavePages("https://www.club.example/results", client);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.pages[0].url, "https://club.example/results/spring.htm");
});

test("rejects a private, local, or non-https address before any request", async () => {
  const client = deps({});
  const cases = [
    "http://club.example/results/",
    "https://127.0.0.1/results/",
    "https://10.1.2.3/results/",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/results/",
    "https://user:pass@club.example/results/",
  ];
  for (const url of cases) {
    const outcome = await fetchSailwavePages(url, client);
    assert.equal(outcome.ok, false, url);
    if (!outcome.ok) assert.equal(outcome.reason, "rejected", url);
  }
  assert.deepEqual(client.requested, []);
});

test("rejects a hostname that resolves to a private address", async () => {
  const client = deps({}, async () => ["10.0.0.5"]);
  const outcome = await fetchSailwavePages("https://club.example/results/", client);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, "rejected");
  assert.deepEqual(client.requested, []);
});

test("does not request a redirect target that is not public https", async () => {
  const client = deps({
    "https://club.example/results/": { status: 302, location: "http://127.0.0.1/secret", body: "" },
  });
  const outcome = await fetchSailwavePages("https://club.example/results/", client);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, "blocked");
  assert.deepEqual(client.requested, ["https://club.example/results/"]);
});

test("reports a browser challenge instead of crawling it", async () => {
  const client = deps({
    "https://club.example/results/": {
      status: 200,
      location: null,
      body: "<html>Just a moment... cf-browser-verification <a href=\"spring.htm\">Spring</a></html>",
    },
  });
  const outcome = await fetchSailwavePages("https://club.example/results/", client);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, "blocked");
  assert.deepEqual(client.requested, ["https://club.example/results/"]);
});

test("reports when the site has no Sailwave pages", async () => {
  const client = deps({
    "https://club.example/results/": { status: 200, location: null, body: "<a href=\"spring.htm\">Spring</a>" },
    "https://club.example/results/spring.htm": { status: 200, location: null, body: "<p>Hello</p>" },
  });
  const outcome = await fetchSailwavePages("https://club.example/results/", client);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, "blocked");
});

test("public and private addresses", () => {
  assert.equal(isPublicIp("93.184.216.34"), true);
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("192.168.0.1"), false);
  assert.equal(isPublicIp("172.16.0.1"), false);
  assert.equal(isPublicIp("127.0.0.1"), false);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("fe80::1"), false);
  assert.equal(isPublicIp("2001:4860:4860::8888"), true);
  assert.equal(isPublicIp("::ffff:127.0.0.1"), false);
});
