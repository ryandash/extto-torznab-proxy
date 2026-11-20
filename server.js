const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createSearchHelpers } = require("./lib/search");
const { createSettingsHtml } = require("./lib/settings-page");

const PORT = Number(process.env.PORT || "8998");
const APP_VERSION = "1.0.3";
const CONFIG_DIR = process.env.CONFIG_DIR || "/config";
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG = {
  baseUrl: "https://extranet.torrentbay.st",
  publicUrl: "",
  flaresolverrUrl: "http://flaresolverr:8191/v1",
  sessionName: "extto_persistent",
  apiKey: "",
  withAdult: true,
  warmEnabled: true,
  warmQuery: "warm",
  warmIntervalMinutes: 10,
  coldThresholdSeconds: 30,
  requestTimeoutMs: 120000,
  idleTimeoutMinutes: 360,
  searchTtlSeconds: 180,
  magnetTtlMinutes: 1440,
  maxSearchCacheItems: 100,
  maxMagnetCacheItems: 1000,
  stripSeasonFromSearch: true
};

let config = { ...DEFAULT_CONFIG };

let sessionReady = false;
let sessionPending = 0;
let sessionBusy = false;
let fsPending = 0;
let fsBusy = false;
let lastUsed = Date.now();
let lastWarm = null;
let currentWarm = null;
let warmPromise = null;
let warmIntervalHandle = null;
let timersStarted = false;

const searchCache = new Map();
const magnetCache = new Map();

let sessionQueue = Promise.resolve();
let fsQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(nowIso(), ...args);
}

function warn(...args) {
  console.warn(nowIso(), ...args);
}

function error(...args) {
  console.error(nowIso(), ...args);
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function randomApiKey() {
  return crypto.randomBytes(18).toString("hex");
}

function loadConfig() {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    const initial = { ...DEFAULT_CONFIG, apiKey: randomApiKey() };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_CONFIG, ...parsed };

    if (!merged.apiKey) {
      merged.apiKey = randomApiKey();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
    }

    return merged;
  } catch (e) {
    error("[config] failed to read config, using defaults:", e.message || e);
    return { ...DEFAULT_CONFIG, apiKey: randomApiKey() };
  }
}

function saveConfig(next) {
  const prev = config;
  ensureConfigDir();
  config = { ...config, ...next };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

  if (
    normalizeBaseUrl(prev.baseUrl) !== normalizeBaseUrl(config.baseUrl) ||
    prev.flaresolverrUrl !== config.flaresolverrUrl ||
    prev.sessionName !== config.sessionName
  ) {
    sessionReady = false;
  }

  if (timersStarted && Number(prev.warmIntervalMinutes) !== Number(config.warmIntervalMinutes)) {
    rescheduleWarmTimer();
  }
}

function normalizeBaseUrl(s) {
  return String(s || "").replace(/\/+$/, "");
}

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlEscape(s) {
  return xmlEscape(s).replace(/'/g, "&#39;");
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function pick(re, s) {
  const m = String(s || "").match(re);
  return m ? m[1] : "";
}

function withSessionLock(fn) {
  sessionPending++;
  sessionBusy = true;

  const run = sessionQueue.then(fn, fn).finally(() => {
    sessionPending = Math.max(0, sessionPending - 1);
    sessionBusy = sessionPending > 0;
  });

  sessionQueue = run.catch(() => {});

  return run;
}

function withFsLock(fn) {
  fsPending++;
  fsBusy = true;

  const run = fsQueue.then(fn, fn).finally(() => {
    fsPending = Math.max(0, fsPending - 1);
    fsBusy = fsPending > 0;
  });

  fsQueue = run.catch(() => {});

  return run;
}

function formatFetchError(prefix, url, err) {
  const cause = err && err.cause ? err.cause : null;
  const parts = [];

  if (cause && cause.code) parts.push(cause.code);
  if (cause && cause.message && (!cause.code || !cause.message.includes(cause.code))) {
    parts.push(cause.message);
  }
  if (!parts.length && err && err.message) {
    parts.push(err.message);
  }

  const detail = parts.join(" - ") || "unknown network error";
  return new Error(`${prefix} at ${url}: ${detail}`, { cause: err });
}

async function fsCall(payload) {
  const url = config.flaresolverrUrl;
  const timeoutMs = Math.max(Number(config.requestTimeoutMs || 120000) + 15000, 30000);

  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    throw formatFetchError("FlareSolverr unreachable", url, e);
  }

  const text = await r.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("FlareSolverr bad JSON response: " + text.slice(0, 300));
  }

  if (!r.ok) {
    throw new Error("FlareSolverr HTTP " + r.status + ": " + text.slice(0, 300));
  }

  if (json.status && json.status !== "ok") {
    throw new Error("FlareSolverr status " + json.status + ": " + (json.message || ""));
  }

  return json;
}

async function destroySessionUnlocked() {
  try {
    await fsCall({
      cmd: "sessions.destroy",
      session: config.sessionName
    });
  } catch (e) {
    warn("[session] destroy ignored:", e.message || e);
  }

  sessionReady = false;
}

async function createSessionUnlocked() {
  await fsCall({
    cmd: "sessions.create",
    session: config.sessionName
  });

  sessionReady = true;
  lastUsed = Date.now();

  log("[session] created", config.sessionName);
}

async function ensureSessionUnlocked() {
  if (sessionReady) return;

  await destroySessionUnlocked();
  await createSessionUnlocked();
}

async function ensureSession() {
  return await withSessionLock(async () => {
    await ensureSessionUnlocked();
  });
}

async function resetSession() {
  return await withSessionLock(async () => {
    log("[session] reset");
    await destroySessionUnlocked();
    await createSessionUnlocked();
  });
}

function cookiesToHeader(cookies) {
  if (!Array.isArray(cookies)) return "";

  return cookies
    .filter(c => c && c.name && typeof c.value !== "undefined")
    .map(c => `${c.name}=${c.value}`)
    .join("; ");
}

function getUserAgent(solution) {
  return (
    solution &&
    (
      solution.userAgent ||
      solution.user_agent ||
      solution.headers?.["user-agent"] ||
      solution.headers?.["User-Agent"]
    )
  ) || "Mozilla/5.0";
}

async function fetchHtmlViaFlaresolverr(targetUrl) {
  await ensureSession();

  lastUsed = Date.now();

  let pageRes;

  try {
    pageRes = await fsCall({
      cmd: "request.get",
      url: targetUrl,
      session: config.sessionName,
      maxTimeout: Number(config.requestTimeoutMs || 120000)
    });
    if (!pageRes || !pageRes.solution || !pageRes.solution.response) {
      throw new Error("empty html response");
    }
  } catch (e) {
    warn("[retry] request.get failed, resetting session:", e.message || e);

    await resetSession();

    pageRes = await fsCall({
      cmd: "request.get",
      url: targetUrl,
      session: config.sessionName,
      maxTimeout: Number(config.requestTimeoutMs || 120000)
    });
  }

  const html = pageRes && pageRes.solution ? pageRes.solution.response : "";

  if (!html) {
    throw new Error("empty html response");
  }

  return {
    html,
    solution: pageRes.solution || {}
  };
}

function setLimitedCache(map, key, value, maxItems, ttlMs) {
  const now = Date.now();

  if (!map.has(key) && map.size >= maxItems) {
    for (const [k, v] of map.entries()) {
      if (now > v.expiresAt) {
        map.delete(k);
      }
    }
  }

  if (!map.has(key) && map.size >= maxItems) {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [k, v] of map.entries()) {
      const t = v.lastHitAt || v.createdAt || 0;
      if (t < oldestTime) {
        oldestTime = t;
        oldestKey = k;
      }
    }

    if (oldestKey) {
      map.delete(oldestKey);
    }
  }

  map.set(key, {
    value,
    createdAt: now,
    lastHitAt: now,
    expiresAt: now + ttlMs,
    hits: 0
  });
}

function getCache(map, key) {
  const item = map.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    map.delete(key);
    return null;
  }

  item.hits++;
  item.lastHitAt = Date.now();

  return item.value;
}

function clearExpiredCache() {
  const now = Date.now();
  let removedSearches = 0;
  let removedMagnets = 0;

  for (const [key, value] of searchCache.entries()) {
    if (now > value.expiresAt) {
      searchCache.delete(key);
      removedSearches++;
    }
  }

  for (const [key, value] of magnetCache.entries()) {
    if (now > value.expiresAt) {
      magnetCache.delete(key);
      removedMagnets++;
    }
  }

  return { removedSearches, removedMagnets };
}

const {
  padNumberText,
  buildTvToken,
  normalizeImdbId,
  normalizeSearchQueryText,
  queryHasTvToken,
  buildSearchQuery,
  resolveSearchInputs,
  mergeSearchResults
} = createSearchHelpers({ getConfig: () => config, log });

async function fetchBrowse(q, imdbId = "") {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  let searchPath;

  if (imdbId) {
    const normalizedId = normalizeImdbId(imdbId);
    searchPath = `/browse/?imdb_id=${encodeURIComponent(normalizedId)}`;
  } else {
    const withAdult = config.withAdult ? "1" : "0";
    searchPath = `/browse/?q=${encodeURIComponent(q).replace(/%20/g, "+")}&with_adult=${withAdult}`;
  }

  const targetUrl = baseUrl + searchPath;
  const cacheKey = targetUrl;
  const cached = getCache(searchCache, cacheKey);

  if (cached) {
    log("[cache] search hit", cacheKey);
    return cached;
  }

  return await withFsLock(async () => {
    const cachedAgain = getCache(searchCache, cacheKey);
    if (cachedAgain) {
      log("[cache] search hit after wait", cacheKey);
      return cachedAgain;
    }

    log("[flaresolverr] browse fetch", targetUrl);

    const r = await fetchHtmlViaFlaresolverr(targetUrl);
    const html = r.html;

    setLimitedCache(
      searchCache,
      cacheKey,
      html,
      Number(config.maxSearchCacheItems || 100),
      Number(config.searchTtlSeconds || 180) * 1000
    );

    log("[cache] search stored", cacheKey);

    return html;
  });
}

function getRows(html) {
  const m = String(html || "").match(/<table[^>]*class=["'][^"']*search-table[^"']*["'][^>]*>[\s\S]*?<\/table>/i);
  const table = m ? m[0] : html;

  const rows = [];
  const re = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  let row;

  while ((row = re.exec(table))) {
    rows.push(row[0]);
  }

  return rows;
}

function getTds(row) {
  const out = [];
  const re = /<td\b[^>]*>[\s\S]*?<\/td>/gi;
  let m;

  while ((m = re.exec(row))) {
    out.push(m[0]);
  }

  return out;
}

function normalizeTitle(s) {
  return stripTags(s)
    .replace(/_/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSizeToBytes(s) {
  const raw = String(s || "").replace(/,/g, ".").trim();
  const m = raw.match(/([\d.]+)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)/i);
  if (!m) return 0;

  const n = Number(m[1]);
  const unit = m[2].toUpperCase();

  const mult =
    unit === "B" ? 1 :
    unit === "KB" || unit === "KIB" ? 1024 :
    unit === "MB" || unit === "MIB" ? 1024 ** 2 :
    unit === "GB" || unit === "GIB" ? 1024 ** 3 :
    unit === "TB" || unit === "TIB" ? 1024 ** 4 :
    1;

  return Math.max(0, Math.floor(n * mult));
}

function parseDateToRfc822(s, nowMs = Date.now()) {
  const text = stripTags(s).trim();
  const lower = text.toLowerCase();

  if (!text || lower === "just now" || lower === "now" || lower === "today") {
    return new Date(nowMs).toUTCString();
  }

  if (lower === "yesterday") {
    return new Date(nowMs - 86400 * 1000).toUTCString();
  }

  const relMatch = lower.match(
    /^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)(?:\s+ago)?$/i
  );

  if (relMatch) {
    const amount = Number(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const d = new Date(nowMs);

    if (unit === "s" || unit.startsWith("sec")) {
      d.setTime(nowMs - amount * 1000);
    } else if (unit === "m" || unit.startsWith("min")) {
      d.setTime(nowMs - amount * 60 * 1000);
    } else if (unit === "h" || unit.startsWith("hr") || unit.startsWith("hour")) {
      d.setTime(nowMs - amount * 3600 * 1000);
    } else if (unit === "d" || unit.startsWith("day")) {
      d.setTime(nowMs - amount * 86400 * 1000);
    } else if (unit === "w" || unit.startsWith("wk") || unit.startsWith("week")) {
      d.setTime(nowMs - amount * 7 * 86400 * 1000);
    } else if (unit.startsWith("mo")) {
      d.setUTCMonth(d.getUTCMonth() - amount);
    } else if (unit === "y" || unit.startsWith("yr") || unit.startsWith("year")) {
      d.setUTCFullYear(d.getUTCFullYear() - amount);
    }

    return d.toUTCString();
  }

  const d = new Date(text);

  if (!isNaN(d.getTime())) {
    return d.toUTCString();
  }

  return new Date(nowMs).toUTCString();
}

function categoryFromRow(row) {
  if (/href=["']\/movies\//i.test(row)) return 2000;
  if (/href=["']\/anime\//i.test(row)) return 5070;
  if (/href=["']\/tv\//i.test(row)) return 5000;
  return 7000;
}

function attr(tag, name) {
  const re = new RegExp(name + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  const m = String(tag || "").match(re);
  return m ? decodeEntities(m[2]) : "";
}

function findTorrentAnchor(row) {
  const re = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  let m;

  while ((m = re.exec(row))) {
    const a = m[0];
    const cls = attr(a, "class");
    const href = attr(a, "href");

    if (cls && cls.split(/\s+/).includes("torrent-title-link") && href) {
      const text = a.replace(/<a\b[^>]*>/i, "").replace(/<\/a>/i, "");
      return { href, text };
    }
  }

  // fallback: class yakalanamazsa torrent detay URL'sine benzeyen ilk link
  re.lastIndex = 0;
  while ((m = re.exec(row))) {
    const a = m[0];
    const href = attr(a, "href");

    if (href && /^\/.+-\d+\/?$/.test(href)) {
      const text = a.replace(/<a\b[^>]*>/i, "").replace(/<\/a>/i, "");
      return { href, text };
    }
  }

  return null;
}

function parseResults(html, req) {
  const rows = getRows(html);
  const items = [];

  for (const row of rows) {
    const found = findTorrentAnchor(row);
    if (!found) continue;

    let relPath = found.href;
    const title = normalizeTitle(found.text);

    if (!title || !relPath) continue;

    if (relPath.startsWith(config.baseUrl)) {
      relPath = relPath.slice(normalizeBaseUrl(config.baseUrl).length);
    }

    if (!relPath.startsWith("/")) continue;

    if (!relPath.endsWith("/")) {
      relPath += "/";
    }

    const id = relPath.replace(/\/$/, "").split("-").pop();
    if (!id || !/^\d+$/.test(id)) continue;

    const tds = getTds(row);

    const sizeText = tds[1] ? stripTags(tds[1]) : "";
    const dateText = tds[3] ? stripTags(tds[3]) : "";
    const seedersText = tds[4] ? stripTags(tds[4]) : "0";
    const leechersText = tds[5] ? stripTags(tds[5]) : "0";

    const size = parseSizeToBytes(sizeText);
    const seeders = Number((seedersText.replace(/,/g, "").match(/\d+/) || ["0"])[0]);
    const leechers = Number((leechersText.replace(/,/g, "").match(/\d+/) || ["0"])[0]);
    const category = categoryFromRow(row);

    const publicBase = getPublicBaseUrl(req);
    const downloadUrl = `${publicBase}/download?id=${encodeURIComponent(id)}&path=${encodeURIComponent(relPath)}`;
    const commentsUrl = normalizeBaseUrl(config.baseUrl) + relPath;

    items.push({
      id,
      title,
      relPath,
      downloadUrl,
      commentsUrl,
      category,
      size,
      seeders,
      leechers,
      pubDate: parseDateToRfc822(dateText)
    });
  }

  log("[parser] rows=", rows.length, "items=", items.length);

  return items;
}

function getPublicBaseUrl(req) {
  if (config.publicUrl) {
    return normalizeBaseUrl(config.publicUrl);
  }

  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}`;
}

function torznabCapsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server title="EXT Torznab Proxy" version="${APP_VERSION}" />
  <limits max="100" default="50" />
  <searching>
    <search available="yes" supportedParams="q" />
    <movie-search available="yes" supportedParams="q,imdbid" />
    <tv-search available="yes" supportedParams="q,imdbid,season,ep" />
  </searching>
  <categories>
    <category id="2000" name="Movies" />
    <category id="5000" name="TV" />
    <category id="5070" name="Anime" />
  </categories>
</caps>`;
}

function torznabErrorXml(code, description) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<error code="${xmlEscape(code)}" description="${xmlEscape(description)}" />`;
}

function torznabResultsXml(items, imdbId = "") {
  const itemXml = items.map(item => {
    const peers = item.seeders + item.leechers;

    return `    <item>
      <title>${xmlEscape(item.title)}</title>
      <guid isPermaLink="false">extto-${xmlEscape(item.id)}</guid>
      <link>${xmlEscape(item.downloadUrl)}</link>
      <comments>${xmlEscape(item.commentsUrl)}</comments>
      <pubDate>${xmlEscape(item.pubDate)}</pubDate>
      <category>${xmlEscape(item.category)}</category>
      <size>${xmlEscape(item.size)}</size>
      <enclosure url="${xmlEscape(item.downloadUrl)}" length="${xmlEscape(item.size)}" type="application/x-bittorrent" />
      <torznab:attr name="category" value="${xmlEscape(item.category)}" />
      <torznab:attr name="seeders" value="${xmlEscape(item.seeders)}" />
      <torznab:attr name="peers" value="${xmlEscape(peers)}" />
      <torznab:attr name="grabs" value="0" />
      ${imdbId ? `<torznab:attr name="imdbid" value="${xmlEscape(imdbId)}" />` : ""}
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>EXT Torznab Proxy</title>
    <description>EXT results via FlareSolverr Torznab proxy</description>
    <link>${xmlEscape(normalizeBaseUrl(config.baseUrl))}</link>
${itemXml}
  </channel>
</rss>`;
}

function apiKeyOk(params) {
  if (!config.apiKey) return true;
  return params.get("apikey") === config.apiKey;
}

async function handleApi(req, res, u) {
  const t = (u.searchParams.get("t") || "search").toLowerCase();

  if (t === "caps") {
    return send(res, 200, "application/xml; charset=utf-8", torznabCapsXml());
  }

  if (!apiKeyOk(u.searchParams)) {
    return send(res, 403, "application/xml; charset=utf-8", torznabErrorXml(100, "Invalid API key"));
  }

  if (t === "search" || t === "movie" || t === "tvsearch") {
    try {
      const { imdbId, searchQuery } = resolveSearchInputs(u.searchParams);
      const resultSets = [];

      // Match RARBG's Torznab behavior: an IMDb ID and a title/episode query
      // are independent criteria, so search both when Prowlarr supplies both.
      if (searchQuery) {
        const textHtml = await fetchBrowse(searchQuery);
        resultSets.push(parseResults(textHtml, req));
      }

      if (imdbId) {
        const imdbHtml = await fetchBrowse("", imdbId);
        resultSets.push(parseResults(imdbHtml, req));
      }

      const items = mergeSearchResults(...resultSets);

      return send(res, 200, "application/rss+xml; charset=utf-8", torznabResultsXml(items, imdbId));
    } catch (e) {
      error("[api]", e && e.stack ? e.stack : e);
      return send(res, 500, "application/xml; charset=utf-8", torznabErrorXml(900, String(e.message || e)));
    }
  }

  return send(res, 400, "application/xml; charset=utf-8", torznabErrorXml(200, "Unsupported function"));
}

function parseMagnetJson(text) {
  const body = pick(/<pre>([\s\S]*?)<\/pre>/, text) || text;
  return JSON.parse(body);
}

async function postMagnetDirect({ id, ts, hmac, csrf, referer, cookies, userAgent }) {
  const postData = new URLSearchParams({
    torrent_id: id,
    action: "get_magnet",
    timestamp: ts,
    hmac,
    sessid: csrf
  }).toString();

  const ajaxUrl = normalizeBaseUrl(config.baseUrl) + "/ajax/getTorrentMagnet.php";
  const timeoutMs = Math.max(Number(config.requestTimeoutMs || 120000), 15000);

  let r;
  try {
    r = await fetch(ajaxUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        "referer": referer,
        "origin": normalizeBaseUrl(config.baseUrl),
        "user-agent": userAgent,
        "accept": "application/json, text/javascript, */*; q=0.01",
        "cookie": cookiesToHeader(cookies)
      },
      body: postData,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    throw formatFetchError("Magnet AJAX request failed", ajaxUrl, e);
  }

  const text = await r.text();

  let json;
  try {
    json = parseMagnetJson(text);
  } catch {
    throw new Error("magnet ajax bad JSON: HTTP " + r.status + " " + text.slice(0, 300));
  }

  if (!r.ok) {
    throw new Error("magnet ajax HTTP " + r.status + ": " + text.slice(0, 300));
  }

  return json;
}

async function fetchMagnetOnce(relPath, id) {
  await ensureSession();

  const url = normalizeBaseUrl(config.baseUrl) + relPath;

  lastUsed = Date.now();

  const pageRes = await fsCall({
    cmd: "request.get",
    url,
    session: config.sessionName,
    maxTimeout: Number(config.requestTimeoutMs || 120000)
  });

  const solution = pageRes && pageRes.solution ? pageRes.solution : {};
  const page = solution.response || "";

  const pageToken = pick(/window\.pageToken\s*=\s*['"]([^'"]+)['"]/, page);
  const csrf = pick(/window\.csrfToken\s*=\s*['"]([^'"]+)['"]/, page);

  if (!pageToken || !csrf) {
    throw new Error("token parse failed");
  }

  const ts = Math.floor(Date.now() / 1000).toString();

  const hmac = crypto
    .createHash("sha256")
    .update(`${id}|${ts}|${pageToken}`)
    .digest("hex");

  const json = await postMagnetDirect({
    id,
    ts,
    hmac,
    csrf,
    referer: url,
    cookies: solution.cookies,
    userAgent: getUserAgent(solution)
  });

  if (!json.success || !json.magnet) {
    throw new Error(json.error || "magnet failed");
  }

  return normalizeMagnet(json.magnet);
}

function normalizeMagnet(value) {
  if (typeof value !== "string") {
    throw new Error("invalid magnet: expected string");
  }

  // 1. Strip control characters (CR, LF, null byte, del, etc.) and trim outer whitespace
  let magnet = value.replace(/[\x00-\x1F\x7F]/g, "").trim();

  if (!magnet.startsWith("magnet:?")) {
    throw new Error("invalid magnet URI: missing magnet:? prefix");
  }

  // 2. Percent-encode spaces and non-ASCII characters (> 127) for HTTP Location header compliance (RFC 7230 / RFC 3986).
  // Printable ASCII characters (33 to 126, including existing %3A, %2F, +, &, etc.) remain completely untouched.
  magnet = magnet.replace(/[^\x21-\x7E]/g, (ch) => (ch === " " ? "%20" : encodeURIComponent(ch)));

  return magnet;
}

async function fetchMagnet(relPath, id) {
  try {
    return await fetchMagnetOnce(relPath, id);
  } catch (e) {
    warn("[retry] magnet failed, resetting session:", e.message || e);

    await resetSession();

    return await fetchMagnetOnce(relPath, id);
  }
}

async function handleDownload(req, res, u) {
  const id = u.searchParams.get("id") || "";
  const relPath = u.searchParams.get("path") || "";

  if (
    !/^\d+$/.test(id) ||
    !relPath ||
    !relPath.startsWith("/") ||
    relPath.startsWith("//") ||
    relPath.includes("..") ||
    !relPath.endsWith("/")
  ) {
    return send(res, 400, "text/plain; charset=utf-8", "bad download parameters");
  }

  const cached = getCache(magnetCache, id);
  if (cached) {
    log("[cache] magnet hit", id);
    try {
      const loc = normalizeMagnet(cached);
      res.writeHead(302, {
        Location: loc,
        "cache-control": "private, max-age=86400"
      });
      return res.end();
    } catch (e) {
      warn("[cache] invalid cached magnet, purging:", e.message || e);
      magnetCache.delete(id);
    }
  }

  try {
    const magnet = await withFsLock(async () => {
      const cachedAgain = getCache(magnetCache, id);
      if (cachedAgain) {
        log("[cache] magnet hit after wait", id);
        return normalizeMagnet(cachedAgain);
      }

      log("[flaresolverr] magnet fetch", id);

      const raw = await fetchMagnet(relPath, id);
      const m = normalizeMagnet(raw);

      setLimitedCache(
        magnetCache,
        id,
        m,
        Number(config.maxMagnetCacheItems || 1000),
        Number(config.magnetTtlMinutes || 1440) * 60 * 1000
      );

      log("[cache] magnet stored", id);

      return m;
    });

    res.writeHead(302, {
      Location: magnet,
      "cache-control": "private, max-age=86400"
    });
    return res.end();
  } catch (err) {
    warn("[download] failed to resolve or normalize magnet for", id, ":", err.message || err);
    return send(res, 502, "text/plain; charset=utf-8", "failed to resolve upstream magnet: " + (err.message || err));
  }
}

async function doWarm() {
  if (warmPromise) {
    return await warmPromise;
  }

  warmPromise = (async () => {
    const start = Date.now();
    const q = config.warmQuery || "warm";

    currentWarm = {
      running: true,
      query: q,
      startedAt: new Date().toISOString()
    };

    try {
      // Warm gerçek siteye gitmeli. Lokal search cache'den dönerse Cloudflare/session sıcak tutulmaz.
      const baseUrl = normalizeBaseUrl(config.baseUrl);
      const withAdult = config.withAdult ? "1" : "0";
      const warmCacheKey = `${baseUrl}/browse/?q=${encodeURIComponent(q).replace(/%20/g, "+")}&with_adult=${withAdult}`;
      searchCache.delete(warmCacheKey);

      await fetchBrowse(q);

      const durationMs = Date.now() - start;
      const duration = Math.round(durationMs / 1000);

      lastWarm = {
        ok: true,
        query: q,
        durationSeconds: duration,
        durationMs,
        cacheBypassed: true,
        state: duration >= Number(config.coldThresholdSeconds || 30) ? "COLD_OR_CHALLENGE" : "WARM",
        at: new Date().toISOString()
      };

      log("[warm]", `query=${q}`, `duration=${duration}s`, `durationMs=${durationMs}`, `state=${lastWarm.state}`, "cacheBypassed=true");

      return lastWarm;
    } catch (e) {
      const durationMs = Date.now() - start;
      const duration = Math.round(durationMs / 1000);

      lastWarm = {
        ok: false,
        query: q,
        durationSeconds: duration,
        durationMs,
        cacheBypassed: true,
        state: "ERROR",
        error: e.message || String(e),
        at: new Date().toISOString()
      };

      warn("[warm] failed", e.message || e);

      return lastWarm;
    } finally {
      currentWarm = null;
      warmPromise = null;
    }
  })();

  return await warmPromise;
}

function runWarmTick(reason) {
  if (!config.warmEnabled) return Promise.resolve();

  log("[warm] scheduled", reason || "timer");

  return doWarm().catch(e => {
    warn("[warm] background failed", e.message || e);
  });
}

function rescheduleWarmTimer() {
  if (warmIntervalHandle) {
    clearInterval(warmIntervalHandle);
    warmIntervalHandle = null;
  }

  const intervalMs = Math.max(1, Number(config.warmIntervalMinutes || 10)) * 60 * 1000;
  warmIntervalHandle = setInterval(() => {
    runWarmTick("interval").catch(e => {
      warn("[warm] interval failed", e.message || e);
    });
  }, intervalMs);

  if (typeof warmIntervalHandle.unref === "function") {
    warmIntervalHandle.unref();
  }
}

function startWarmTimer() {
  // İlk açılışta 10 dakika bekleme; servis başladıktan kısa süre sonra warm yap.
  const startupTimer = setTimeout(() => {
    runWarmTick("startup").catch(e => {
      warn("[warm] startup failed", e.message || e);
    });
  }, 5000);

  if (typeof startupTimer.unref === "function") {
    startupTimer.unref();
  }

  rescheduleWarmTimer();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let tooLarge = false;
    req.on("data", chunk => {
      if (tooLarge) return;
      data += chunk;
      if (data.length > 1024 * 1024) {
        tooLarge = true;
        req.destroy();
        reject(new Error("body too large"));
      }
    });
    req.on("end", () => {
      if (!tooLarge) resolve(data);
    });
    req.on("error", err => {
      if (!tooLarge) reject(err);
    });
  });
}

function boolFromForm(v) {
  return v === "on" || v === "true" || v === "1";
}

function formatDurationView(seconds, ms) {
  if (typeof ms === "number" && ms > 0 && seconds < 1) {
    return `${ms}ms`;
  }

  return `${seconds || 0}s`;
}

function getCurrentWarmSeconds() {
  if (!currentWarm || !currentWarm.startedAt) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - new Date(currentWarm.startedAt).getTime()) / 1000));
}

function getCurrentWarmState() {
  const runningSeconds = getCurrentWarmSeconds();

  if (runningSeconds === null) {
    return null;
  }

  return runningSeconds >= Number(config.coldThresholdSeconds || 30)
    ? "CHALLENGE"
    : "RUNNING";
}

function getWarmBadgeText() {
  if (!config.warmEnabled) {
    return "Off";
  }

  const runningSeconds = getCurrentWarmSeconds();
  const state = getCurrentWarmState();

  if (runningSeconds !== null) {
    return state === "CHALLENGE"
      ? `Challenge ${runningSeconds}s`
      : `Running ${runningSeconds}s`;
  }

  return "On";
}

function getWarmAgeView() {
  const runningSeconds = getCurrentWarmSeconds();
  const state = getCurrentWarmState();

  if (runningSeconds !== null) {
    return state === "CHALLENGE"
      ? `${runningSeconds}s CHALLENGE`
      : `${runningSeconds}s RUNNING`;
  }

  if (!lastWarm || !lastWarm.ok || !lastWarm.at) {
    return "—";
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(lastWarm.at).getTime()) / 1000));
  return `${ageSeconds}s WARM`;
}

function getLastWarmRunView() {
  const runningSeconds = getCurrentWarmSeconds();
  const state = getCurrentWarmState();

  if (runningSeconds !== null) {
    return state === "CHALLENGE"
      ? `${runningSeconds}s CHALLENGE`
      : `${runningSeconds}s RUNNING`;
  }

  if (!lastWarm) {
    return "—";
  }

  if (!lastWarm.ok) {
    return `${formatDurationView(lastWarm.durationSeconds || 0, lastWarm.durationMs)} ERROR`;
  }

  return `${formatDurationView(lastWarm.durationSeconds || 0, lastWarm.durationMs)} ${lastWarm.state || "UNKNOWN"}`;
}

function positiveInt(value, fallback, min = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.floor(n);
}

function parseForm(body) {
  const p = new URLSearchParams(body);
  const baseUrl = normalizeBaseUrl(p.get("baseUrl")) || config.baseUrl || DEFAULT_CONFIG.baseUrl;
  const flaresolverrUrl = String(p.get("flaresolverrUrl") || "").trim() || config.flaresolverrUrl || DEFAULT_CONFIG.flaresolverrUrl;
  const sessionName = String(p.get("sessionName") || "").trim() || config.sessionName || DEFAULT_CONFIG.sessionName;
  const warmQuery = String(p.get("warmQuery") || "").trim() || config.warmQuery || DEFAULT_CONFIG.warmQuery;

  return {
    baseUrl,
    publicUrl: normalizeBaseUrl(p.get("publicUrl")),
    flaresolverrUrl,
    sessionName,
    apiKey: String(p.get("apiKey") ?? "").trim(),
    withAdult: boolFromForm(p.get("withAdult")),
    stripSeasonFromSearch: boolFromForm(p.get("stripSeasonFromSearch")),
    warmEnabled: boolFromForm(p.get("warmEnabled")),
    warmQuery,
    warmIntervalMinutes: positiveInt(p.get("warmIntervalMinutes"), config.warmIntervalMinutes || 10, 1),
    coldThresholdSeconds: positiveInt(p.get("coldThresholdSeconds"), config.coldThresholdSeconds || 30, 1),
    searchTtlSeconds: positiveInt(p.get("searchTtlSeconds"), config.searchTtlSeconds || 180, 1),
    magnetTtlMinutes: positiveInt(p.get("magnetTtlMinutes"), config.magnetTtlMinutes || 1440, 1),
    maxSearchCacheItems: positiveInt(p.get("maxSearchCacheItems"), config.maxSearchCacheItems || 100, 1),
    maxMagnetCacheItems: positiveInt(p.get("maxMagnetCacheItems"), config.maxMagnetCacheItems || 1000, 1),
    requestTimeoutMs: positiveInt(p.get("requestTimeoutMs"), config.requestTimeoutMs || 120000, 1000),
    idleTimeoutMinutes: positiveInt(p.get("idleTimeoutMinutes"), config.idleTimeoutMinutes || 360, 1)
  };
}

function send(res, status, type, body) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store"
  });
  res.end(body);
}

function startBackgroundTimers() {
  if (timersStarted) return;
  timersStarted = true;

  setInterval(() => {
    const r = clearExpiredCache();

    if (r.removedSearches > 0 || r.removedMagnets > 0) {
      log("[cache] expired removed searches=", r.removedSearches, "magnets=", r.removedMagnets);
    }
  }, 5 * 60 * 1000).unref();

  setInterval(async () => {
    const idle = Date.now() - lastUsed;
    const idleTimeoutMs = Number(config.idleTimeoutMinutes || 360) * 60 * 1000;

    if (sessionReady && idle > idleTimeoutMs) {
      log("[idle] destroying session after", config.idleTimeoutMinutes, "minutes");
      await withSessionLock(async () => {
        if (sessionReady && Date.now() - lastUsed > idleTimeoutMs) {
          await destroySessionUnlocked();
        }
      });
    }
  }, 60 * 1000).unref();

  startWarmTimer();
}

const settingsHtml = createSettingsHtml(() => ({
  config,
  getCurrentWarmSeconds,
  getCurrentWarmState,
  lastWarm,
  htmlEscape,
  sessionReady,
  currentWarm,
  fsBusy,
  getWarmBadgeText,
  searchCache,
  magnetCache,
  lastUsed,
  getWarmAgeView,
  getLastWarmRunView,
  normalizeBaseUrl
}));

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");

    if (req.method === "GET" && u.pathname === "/") {
      const savedMessage = u.searchParams.get("saved") === "1"
        ? "Settings saved."
        : "";

      return send(res, 200, "text/html; charset=utf-8", settingsHtml(savedMessage));
    }

    if (req.method === "POST" && u.pathname === "/settings") {
      const body = await readBody(req);
      const next = parseForm(body);

      saveConfig(next);

      res.writeHead(303, {
        Location: "/?saved=1"
      });
      return res.end();
    }

    if (req.method === "GET" && u.pathname === "/health") {
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify({
        ok: true,
        app: "extto-torznab-proxy",
        version: APP_VERSION,
        baseUrl: config.baseUrl,
        flaresolverrUrl: config.flaresolverrUrl,
        sessionName: config.sessionName,
        sessionReady,
        sessionBusy,
        fsBusy,
        idleSeconds: Math.floor((Date.now() - lastUsed) / 1000),
        searchCacheItems: searchCache.size,
        magnetCacheItems: magnetCache.size,
        warmEnabled: config.warmEnabled,
        warmIntervalMinutes: config.warmIntervalMinutes,
        coldThresholdSeconds: config.coldThresholdSeconds,
        warmRunning: !!currentWarm,
        currentWarm: currentWarm ? {
          query: currentWarm.query,
          startedAt: currentWarm.startedAt,
          runningSeconds: Math.max(0, Math.floor((Date.now() - new Date(currentWarm.startedAt).getTime()) / 1000))
        } : null,
        warmAgeSeconds: lastWarm && lastWarm.ok ? Math.max(0, Math.floor((Date.now() - new Date(lastWarm.at).getTime()) / 1000)) : null,
        lastWarmRun: lastWarm ? {
          durationSeconds: lastWarm.durationSeconds,
          durationMs: lastWarm.durationMs,
          state: lastWarm.state,
          at: lastWarm.at
        } : null,
        lastWarm
      }, null, 2));
    }

    if (req.method === "GET" && u.pathname === "/warm") {
      const result = await doWarm();
      return send(res, result.ok ? 200 : 500, "application/json; charset=utf-8", JSON.stringify(result, null, 2));
    }

    if (req.method === "POST" && u.pathname === "/api-key/regenerate") {
      const nextApiKey = randomApiKey();
      saveConfig({ ...config, apiKey: nextApiKey });
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, apiKey: nextApiKey }, null, 2));
    }

    if (req.method === "GET" && u.pathname === "/cache/clear") {
      const s = searchCache.size;
      const m = magnetCache.size;
      searchCache.clear();
      magnetCache.clear();
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, clearedSearches: s, clearedMagnets: m }, null, 2));
    }

    if (req.method === "GET" && u.pathname === "/session/reset") {
      await withSessionLock(async () => {
        await destroySessionUnlocked();
      });
      return send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, sessionReset: true }, null, 2));
    }

    if (req.method === "GET" && u.pathname === "/api") {
      return await handleApi(req, res, u);
    }

    if (req.method === "GET" && u.pathname === "/download") {
      return await handleDownload(req, res, u);
    }

    return send(res, 404, "text/plain; charset=utf-8", "not found");
  } catch (e) {
    error("[error]", e && e.stack ? e.stack : e);
    return send(res, 500, "text/plain; charset=utf-8", String(e.message || e));
  }
});

if (require.main === module) {
  config = loadConfig();
  server.listen(PORT, "0.0.0.0", () => {
    log("extto-torznab-proxy listening on :" + PORT);
    log("config:", CONFIG_FILE);
    log("base:", config.baseUrl);
    log("flaresolverr:", config.flaresolverrUrl);
    log("session:", config.sessionName);
    startBackgroundTimers();
  });
}

module.exports = {
  APP_VERSION,
  normalizeMagnet,
  parseDateToRfc822,
  decodeEntities,
  xmlEscape,
  torznabCapsXml,
  buildSearchQuery,
  normalizeImdbId,
  resolveSearchInputs,
  mergeSearchResults,
  parseResults,
  setLimitedCache,
  fsCall,
  getConfig: () => config,
  setConfigForTest: (partial) => {
    config = { ...config, ...partial };
  },
  server,
};
